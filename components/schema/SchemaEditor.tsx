'use client'

import { cloneElement, useEffect, useId, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { nip19 } from 'nostr-tools'
import { buildCuratedSchemaTemplate, CURATED_SCHEMA_KIND, parseCoordinate, type FieldDef, type FieldType, type Visibility } from '@/lib/protocol/curated'
import { RULES } from '@/lib/protocol/derive'
import { TEMPLATES, templateByKey } from '@/lib/protocol/templates'
import {
  addField,
  draftFromSchema,
  draftFromTemplate,
  draftIdentifier,
  draftToSchema,
  FIELD_TYPES,
  isLocked,
  moveField,
  removeField,
  setRule,
  updateField,
  validateDraft,
  type SchemaDraft,
} from '@/lib/entry/schemaForm'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { directoryRelays } from '@/lib/nostr/relays'
import { sessionStore, useSession } from '@/lib/store/session'
import { useResolvedSchema } from '@/lib/store/useResolvedSchema'
import { clearResolveCache } from '@/lib/resolve/schema'
import { withBase } from '@/lib/router'
import { listPath, parsePubkey, type ListRef } from '@/lib/routes'
import { Notice } from '@/components/list/ListPage'
import { CURARE_APP_URL } from '@/components/mod/ModQueue'

const PRODUCTION = process.env.NODE_ENV === 'production'

const input = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none'
const small = 'rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none'

/** /new/: pick a template, fill in the identity and the fields, publish a kind 31889 — your key becomes the curator. */
export function SchemaEditorPage() {
  const params = useSearchParams()
  const edit = params.get('edit')
  const templateKey = params.get('template')
  const editRef = useMemo<ListRef | null>(() => {
    const c = edit ? parseCoordinate(edit) : null
    return c && c.kind === CURATED_SCHEMA_KIND ? { by: 'coordinate', curator: { type: 'pubkey', pubkey: c.pubkey }, identifier: c.identifier } : null
  }, [edit])

  if (editRef) return <EditExisting list={editRef} />
  if (!templateKey) return <TemplatePicker />
  return <Editor initial={draftFromTemplate(templateByKey(templateKey))} />
}

function TemplatePicker() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Start a list</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        A list is a schema: what a post may contain, who may suggest, and where it lives. You publish it signed with
        your key, and that key is the only one that can put anything on its front page.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <a
            key={t.key}
            href={withBase(`/new/?template=${t.key}`)}
            className="rounded-lg border border-line bg-surface p-4 no-underline hover:border-line-strong"
          >
            <h2 className="font-medium text-ink">{t.name}</h2>
            <p className="mt-1 text-sm text-muted">{t.description}</p>
            <p className="mt-2 text-xs text-muted">{t.fields.length} fields</p>
          </a>
        ))}
      </div>
      <p className="mt-8 max-w-prose text-sm text-muted">
        A list curated by a team — several people behind one threshold key — is made in the{' '}
        <a href={CURARE_APP_URL} className="underline" rel="noopener noreferrer" target="_blank">
          Curare app
        </a>
        , which has this editor and the signing ceremony. This page makes lists curated by one key: yours.
      </p>
    </div>
  )
}

function EditExisting({ list }: { list: ListRef }) {
  const resolved = useResolvedSchema(list)
  const session = useSession()
  if (resolved.status === 'loading') return <Notice title="Looking up the list…" body="Fetching and verifying its schema." />
  if (resolved.status === 'unavailable') return <Notice title="Not a list" body={resolved.reason} />
  if (session.status !== 'checking' && session.pubkey !== resolved.schema.namespace) {
    return <Notice title="Not yours to edit" body="Only the key that published a schema can revise it. Sign in with that key." />
  }
  return <Editor initial={draftFromSchema(resolved.schema)} editing />
}

function Editor({ initial, editing }: { initial: SchemaDraft; editing?: boolean }) {
  const session = useSession()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState<{ pubkey: string; identifier: string; accepted: number; total: number } | null>(null)
  const [authorsText, setAuthorsText] = useState(initial.authors.map((a) => nip19.npubEncode(a)).join('\n'))
  const [relayText, setRelayText] = useState('')

  useEffect(() => {
    document.title = `${editing ? 'Edit' : 'New'} list · curare.to`
  }, [editing])

  // A ws:// relay the site itself is built against (a dev or test setup) is not refused.
  const problems = useMemo(() => validateDraft(draft, { production: PRODUCTION, namespace: session.pubkey ?? undefined, allowInsecure: directoryRelays() }), [draft, session.pubkey])
  const blocking = problems.filter((p) => !p.warning)
  const set = (patch: Partial<SchemaDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const setAuthors = (text: string) => {
    setAuthorsText(text)
    const authors = text
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parsePubkey(s) ?? s)
    set({ authors })
  }

  async function publish() {
    setError(null)
    const pubkey = session.pubkey ?? (await sessionStore.signIn())
    if (!pubkey) {
      setError('Sign in with a NIP-07 extension: your key becomes the curator.')
      return
    }
    if (blocking.length > 0) return
    setBusy(true)
    try {
      const schema = draftToSchema(draft, pubkey)
      const template = buildCuratedSchemaTemplate(schema)
      const relays = schema.relays.length > 0 ? schema.relays : [...directoryRelays()]
      const { accepted, total } = await signAndPublish(template, relays)
      clearResolveCache()
      setPublished({ pubkey, identifier: schema.identifier, accepted, total })
    } catch (err) {
      setError(err instanceof Nip07Error ? err.message : 'Something went wrong while publishing.')
    } finally {
      setBusy(false)
    }
  }

  if (published) {
    const href = withBase(listPath({ namespace: published.pubkey, identifier: published.identifier }))
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">{editing ? 'Revised' : 'Published'}</h1>
        <p className="mt-2 text-ink-2">
          {published.accepted} of {published.total} relays accepted the schema. You are its curator: only your key can put anything on its front page.
          It appears in the directory as soon as a directory relay has it.
        </p>
        <a href={href} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink">
          Open the list
        </a>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{editing ? `Edit ${draft.name}` : 'New list'}</h1>
      <p className="mt-1 text-sm text-muted">
        {editing ? 'Republished under the same identifier, this replaces the schema; every entry keeps replying to the same coordinate.' : 'Everything here is signed into one event that other clients read the form from.'}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void publish()
        }}
        className="mt-6 space-y-8"
        noValidate
      >
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Identity</h2>
          <Labelled label="Name" hint="What people call it. Up to 100 characters." error={problemFor(problems, 'name')}>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={input} placeholder="Things worth a look" maxLength={100} />
          </Labelled>
          <Labelled label="Description" hint="What the list is for. Up to 500 characters." error={problemFor(problems, 'description')}>
            <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} className={`${input} min-h-20`} maxLength={500} rows={3} />
          </Labelled>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labelled label="Identifier" hint={editing ? 'Locked: it is the coordinate everything replies to.' : 'Derived from the name unless you set one.'} error={problemFor(problems, 'd')}>
              <input value={editing ? draft.identifier : draft.identifier} onChange={(e) => set({ identifier: e.target.value })} className={input} placeholder={draftIdentifier(draft) || 'things'} disabled={editing} />
            </Labelled>
            <Labelled label="Event title" hint="Labels the event; defaults to “<name> suggestion”." error={problemFor(problems, 'title')}>
              <input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={input} placeholder={draft.name ? `${draft.name} suggestion` : ''} maxLength={200} />
            </Labelled>
            <Labelled label="Picture" hint="An https image for the list." error={problemFor(problems, 'picture')}>
              <input value={draft.picture} onChange={(e) => set({ picture: e.target.value })} className={input} placeholder="https://…" type="url" />
            </Labelled>
            <Labelled label="Domain" hint="A claim until that site serves the schema at /.well-known/curare.to/nostr.json." error={problemFor(problems, 'domain')}>
              <input value={draft.domain} onChange={(e) => set({ domain: e.target.value })} className={input} placeholder="things.example" />
            </Labelled>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Who may suggest</h2>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['public', 'closed', 'private'] as Visibility[]).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input type="radio" name="visibility" checked={draft.visibility === v} onChange={() => set({ visibility: v })} />
                <span className="capitalize">{v}</span>
                <span className="text-muted">
                  {v === 'public' ? '— anyone' : v === 'closed' ? '— you and the keys below; anyone may read' : '— you and the keys below; shown only to them'}
                </span>
              </label>
            ))}
          </div>
          {draft.visibility !== 'public' ? (
            <Labelled label="Other keys that may suggest" hint="npubs, one per line. Curation stays with you." error={problemFor(problems, 'authors')}>
              <textarea value={authorsText} onChange={(e) => setAuthors(e.target.value)} className={`${input} min-h-20 font-mono text-xs`} rows={3} placeholder="npub1…" />
            </Labelled>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Relays</h2>
          <p className="text-sm text-muted">Where the list lives: suggestions, entries, comments and votes go here and are read from here.</p>
          <ul className="space-y-1">
            {draft.relays.map((r, i) => (
              <li key={`${r}-${i}`} className="flex items-center gap-2 font-mono text-xs">
                <span className="flex-1 break-all">{r}</span>
                <button type="button" onClick={() => set({ relays: draft.relays.filter((_, j) => j !== i) })} className="text-muted hover:text-danger">
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <input value={relayText} onChange={(e) => setRelayText(e.target.value)} className={`${input} max-w-sm`} placeholder="wss://…" aria-label="Relay URL" />
            <button
              type="button"
              onClick={() => {
                if (relayText.trim()) set({ relays: [...draft.relays, relayText.trim()] })
                setRelayText('')
              }}
              className="rounded-md border border-line px-3 py-2 text-sm hover:border-line-strong"
            >
              Add relay
            </button>
            {directoryRelays().filter((r) => !draft.relays.includes(r)).map((r) => (
              <button key={r} type="button" onClick={() => set({ relays: [...draft.relays, r] })} className="rounded-md border border-line px-3 py-2 text-xs text-muted hover:border-line-strong">
                + {r}
              </button>
            ))}
          </div>
          {problemsFor(problems, 'relay').map((p, i) => (
            <p key={i} className={`text-xs ${p.warning ? 'text-note' : 'text-danger'}`}>
              {p.message}
            </p>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Fields</h2>
          <Labelled label="How a post gets its identifier" hint={RULES.find((r) => r.key === draft.rule)?.description}>
            <select value={draft.rule} onChange={(e) => setDraft((d) => setRule(d, e.target.value as SchemaDraft['rule']))} className={input}>
              {RULES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Labelled>
          <ol className="space-y-3">
            {draft.fields.map((field, i) => (
              <FieldRow
                key={i}
                field={field}
                index={i}
                count={draft.fields.length}
                error={problemFor(problems, `field.${i}`)}
                onChange={(patch) => setDraft((d) => updateField(d, i, patch))}
                onRemove={() => setDraft((d) => removeField(d, i))}
                onMove={(to) => setDraft((d) => moveField(d, i, to))}
              />
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {FIELD_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => setDraft((d) => addField(d, t.key))} className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-line-strong">
                + {t.label}
              </button>
            ))}
          </div>
          <Labelled label="At least one of" hint="Field names, comma-separated: a post needs one of them without any being required on its own." error={problemFor(problems, 'requireAny')}>
            <input
              value={draft.requireAny.map((g) => g.join(', ')).join(' | ')}
              onChange={(e) =>
                set({
                  requireAny: e.target.value
                    .split('|')
                    .map((g) => g.split(',').map((n) => n.trim()).filter(Boolean))
                    .filter((g) => g.length > 0),
                })
              }
              className={input}
              placeholder="link, body"
            />
          </Labelled>
        </section>

        <section className="space-y-3 border-t border-line pt-6">
          {blocking.length > 0 ? (
            <ul className="space-y-1 text-sm text-danger">
              {blocking.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-accent-ink">This is a usable schema.</p>
          )}
          <p className="text-sm text-ink-2">
            <strong>Your key becomes the curator.</strong> The schema is signed in your extension
            {session.pubkey ? ` as ${nip19.npubEncode(session.pubkey).slice(0, 16)}…` : ''}, and only that key can put anything on the list&apos;s front page.
          </p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" disabled={busy || blocking.length > 0} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50">
            {busy ? 'Signing…' : editing ? 'Sign and republish' : session.pubkey ? 'Sign and publish' : 'Sign in and publish'}
          </button>
        </section>
      </form>
    </div>
  )
}

function problemFor(problems: { field: string; message: string; warning?: boolean }[], field: string): string | undefined {
  return problems.find((p) => p.field === field && !p.warning)?.message
}
function problemsFor(problems: { field: string; message: string; warning?: boolean }[], field: string) {
  return problems.filter((p) => p.field === field)
}

/** A label for one control; the hint sits beside the label, not inside it, so the control's name is the label alone. */
function Labelled({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId()
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id} className="block font-medium text-ink">
        {label}
      </label>
      {cloneElement(children, { id })}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

function FieldRow({
  field,
  index,
  count,
  error,
  onChange,
  onRemove,
  onMove,
}: {
  field: FieldDef
  index: number
  count: number
  error?: string
  onChange: (patch: Partial<FieldDef>) => void
  onRemove: () => void
  onMove: (to: number) => void
}) {
  const locked = isLocked(field)
  const tag = field.config.tag ?? field.name
  const numeric = field.type === 'year' || field.type === 'number' || field.type === 'duration'
  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 text-xs text-muted">{index + 1}.</span>
        {tag === 'd' ? (
          <span className="text-sm text-ink">
            Identifier <span className="text-muted">— derived by the rule above, never prompted for</span>
          </span>
        ) : (
          <>
            <input value={field.name} onChange={(e) => onChange({ name: e.target.value })} className={`${small} w-32 font-mono text-xs`} placeholder="name" aria-label="Field name" disabled={locked} />
            <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} className={`${small} w-40`} placeholder="Label" aria-label="Field label" />
            <select value={field.type} onChange={(e) => onChange({ type: e.target.value as FieldType })} className={small} aria-label="Field type" disabled={locked}>
              {FIELD_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} disabled={locked} /> required
            </label>
          </>
        )}
        <span className="ml-auto flex gap-1 text-xs">
          <button type="button" onClick={() => onMove(index - 1)} disabled={index === 0} className="px-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move up">
            ↑
          </button>
          <button type="button" onClick={() => onMove(index + 1)} disabled={index === count - 1} className="px-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move down">
            ↓
          </button>
          <button type="button" onClick={onRemove} disabled={locked} className="px-1 text-muted hover:text-danger disabled:opacity-30" aria-label="Remove field">
            ✕
          </button>
        </span>
      </div>
      {tag !== 'd' ? (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <input value={field.placeholder} onChange={(e) => onChange({ placeholder: e.target.value })} className={`${small} w-44`} placeholder="Placeholder" aria-label="Placeholder" />
          <input value={field.config.hint ?? ''} onChange={(e) => onChange({ config: { hint: e.target.value || undefined } })} className={`${small} w-56`} placeholder="Hint under the input" aria-label="Hint" />
          {field.type === 'enum' ? (
            <input
              value={(field.config.options ?? []).join(', ')}
              onChange={(e) => onChange({ config: { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) } })}
              className={`${small} w-56`}
              placeholder="options, comma-separated"
              aria-label="Options"
            />
          ) : null}
          {numeric ? (
            <>
              <input type="number" value={field.config.min ?? ''} onChange={(e) => onChange({ config: { min: e.target.value === '' ? undefined : Number(e.target.value) } })} className={`${small} w-24`} placeholder="min" aria-label="Minimum" />
              <input type="number" value={field.config.max ?? ''} onChange={(e) => onChange({ config: { max: e.target.value === '' ? undefined : Number(e.target.value) } })} className={`${small} w-24`} placeholder="max" aria-label="Maximum" />
            </>
          ) : (
            <input type="number" value={field.config.max ?? ''} onChange={(e) => onChange({ config: { max: e.target.value === '' ? undefined : Number(e.target.value) } })} className={`${small} w-28`} placeholder="max chars" aria-label="Maximum length" />
          )}
          {!locked ? (
            <>
              <input value={field.config.tag ?? ''} onChange={(e) => onChange({ config: { tag: e.target.value || undefined } })} className={`${small} w-24 font-mono`} placeholder="tag" aria-label="Tag" title="The tag the value is written to; defaults to the field name. `content` means the event body." />
              <input value={field.config.marker ?? ''} onChange={(e) => onChange({ config: { marker: e.target.value || undefined } })} className={`${small} w-24 font-mono`} placeholder="marker" aria-label="Marker" />
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!field.config.repeat} onChange={(e) => onChange({ config: { repeat: e.target.checked || undefined } })} /> repeatable
              </label>
              {field.type === 'url' ? (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!field.config.https} onChange={(e) => onChange({ config: { https: e.target.checked || undefined } })} /> https only
                </label>
              ) : null}
              <input value={field.config.pattern ?? ''} onChange={(e) => onChange({ config: { pattern: e.target.value || undefined } })} className={`${small} w-40 font-mono`} placeholder="pattern (regex)" aria-label="Pattern" />
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </li>
  )
}
