'use client'

import { useMemo, useState, type FormEvent } from 'react'
import type { Event } from 'nostr-tools/pure'
import { canCurate, canSuggest, type CuratedSchema, type CuratedSuggestionValues } from '@/lib/protocol/curated'
import type { PostGroup } from '@/lib/protocol/group'
import { emptyValues, identifierFor, prepareSuggestion, promptedFields, valuesOfEntry } from '@/lib/entry/form'
import { prepareCanonical } from '@/lib/entry/curate'
import { Nip07Error, signAndPublish } from '@/lib/nostr/nip07'
import { sessionStore, useSession } from '@/lib/store/session'
import { getListStore } from '@/lib/store/listStore'
import { entryPath } from '@/lib/routes'
import { ProfileName } from '@/components/ui/ProfileName'
import { FieldInput } from './FieldInput'

export interface Published {
  event: Event
  accepted: number
  total: number
  identifier: string
}

/**
 * The schema-driven form: bitcoin.mov's SubmitForm with the field names read
 * off the schema. `editing` reuses an entry's `d` so the new event replaces
 * it; `groups` lets the form warn before a second version of an existing post.
 * In `canonical` mode it signs a kind 31890 for the curator — from `source`,
 * the suggestion being corrected on the way through, or from nothing.
 */
export function EntryForm({
  schema,
  editing,
  groups,
  onPublished,
  mode = 'suggest',
  source = null,
  onCancel,
}: {
  schema: CuratedSchema
  editing?: Event | null
  groups: PostGroup[]
  onPublished: (published: Published) => void
  mode?: 'suggest' | 'canonical'
  source?: Event | null
  onCancel?: () => void
}) {
  const session = useSession()
  const fields = promptedFields(schema)
  const prefill = editing ?? source
  const [values, setValues] = useState<CuratedSuggestionValues>(() =>
    prefill ? valuesOfEntry(prefill, schema) : emptyValues(schema),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [acknowledgedDuplicate, setAcknowledgedDuplicate] = useState(false)

  const pubkey = session.pubkey
  const canonical = mode === 'canonical'
  const blocked = pubkey ? (canonical ? !canCurate(schema, pubkey) : !canSuggest(schema, pubkey)) : false
  const editingIdentifier = (editing ?? source)?.tags.find((t) => t[0] === 'd')?.[1] ?? null
  const derived = editingIdentifier ?? identifierFor(schema, values)
  const duplicate = useMemo(
    () => (editing ? null : (groups.find((g) => g.identifier === derived) ?? null)),
    [groups, derived, editing],
  )

  const set = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setAcknowledgedDuplicate(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const signer = pubkey ?? (await sessionStore.signIn())
    const prepared = canonical
      ? { ...prepareCanonical(schema, values, { curator: signer, identifier: derived, source }), identifier: derived }
      : prepareSuggestion(schema, values, { pubkey: signer, identifier: editingIdentifier ?? undefined })
    setErrors(prepared.errors)
    if (!prepared.template) {
      const general = prepared.errors.visibility ?? prepared.errors.curator
      if (general) setFormError(general)
      return
    }
    // The duplicate check must not race the relays: wait for the first read.
    const loaded = await getListStore(schema).whenLoaded()
    const existing = editing || canonical ? null : (loaded.groups.find((g) => g.identifier === prepared.identifier) ?? null)
    if (existing && !acknowledgedDuplicate) {
      setAcknowledgedDuplicate(true)
      return
    }
    if (editing && signer !== editing.pubkey) {
      setFormError('Only the key that published this entry can edit it; signing with yours would make a new entry.')
      return
    }

    setSubmitting(true)
    try {
      const relays = [...new Set([...schema.relays, ...session.writeRelays])]
      const { signed, accepted, total } = await signAndPublish(prepared.template, relays)
      getListStore(schema).pushEvent(signed)
      onPublished({ event: signed, accepted, total, identifier: prepared.identifier })
    } catch (err) {
      setFormError(err instanceof Nip07Error ? err.message : 'Something went wrong while publishing.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {fields.map(({ field, required, anyOf }) => (
        <FieldInput
          key={field.name}
          field={field}
          value={values[field.name] ?? ''}
          error={errors[field.name]}
          required={required}
          anyOf={anyOf}
          onChange={(v) => set(field.name, v)}
        />
      ))}

      <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
        Identifier: <code className="font-mono text-ink">{derived || '…'}</code>
        {editing ? ' — kept, so this replaces the entry.' : source ? ' — kept from the suggestion; curating again revises in place.' : ' — the same identifier is the same post.'}
      </div>

      {duplicate ? (
        <div className="rounded-md border border-note bg-note-soft px-3 py-2 text-sm text-ink">
          Already suggested by <ProfileName pubkey={duplicate.head.pubkey} />
          {duplicate.state === 'curated' ? ' and on the front page' : ''} —{' '}
          <a href={entryPath(schema, duplicate.identifier)} className="underline">
            see it
          </a>
          . {acknowledgedDuplicate ? 'Submit again to publish your version anyway.' : 'You can still publish your own version.'}
        </div>
      ) : null}

      {blocked ? (
        <p className="text-sm text-danger">
          {canonical
            ? 'Only the key that published this schema may curate; a team curates in the Curare app.'
            : `This list is ${schema.visibility}; your key is not one it accepts suggestions from.`}
        </p>
      ) : null}
      {formError ? <p className="text-sm text-danger">{formError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting || blocked}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-50"
        >
          {submitting ? 'Signing…' : canonical ? 'Sign and curate' : editing ? 'Publish the edit' : pubkey ? 'Sign and publish' : 'Sign in and publish'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        ) : null}
        <span className="text-xs text-muted">
          Signed in your extension; sent to {schema.relays.length > 0 ? schema.relays.join(', ') : 'the directory relays'}
          {session.writeRelays.length > 0 ? ` and ${session.writeRelays.length} of your own` : ''}.
        </span>
      </div>
    </form>
  )
}
