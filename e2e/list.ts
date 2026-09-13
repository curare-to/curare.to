import type { Event } from 'nostr-tools/pure'
import { pubkeyOf, signedBy } from '../test/keys'

/* ------------------------------------------------------------------ *
 * The list the end-to-end run reads: a schema from a throwaway key naming
 * the local relay, a dozen posts by three people, five of them curated.
 * Built here, in the run's own setup, and published by it — there is no
 * seed script in this repository. Deterministic keys, fixed timestamps.
 * ------------------------------------------------------------------ */

export const RELAY = 'ws://localhost:10547'
export const CURATOR = pubkeyOf('e2e curator')
export const IDENTIFIER = 'things'
export const ADDRESS = `31889:${CURATOR}:${IDENTIFIER}`

const T0 = 1_760_000_000

export function schemaEvent(): Event {
  return signedBy('e2e curator', {
    kind: 31889,
    tags: [
      ['d', IDENTIFIER],
      ['title', 'things suggestion'],
      ['name', 'Things worth a look'],
      ['description', 'Links and notes worth a look, curated by one key for the end-to-end run.'],
      ['visibility', 'public'],
      ['relay', RELAY],
      ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80,"derived":true}'],
      ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
      ['field', 'link', 'url', 'optional', 'https://…', 'Link', '{"tag":"r","marker":"link","max":500}'],
      ['field', 'body', 'longtext', 'optional', '', 'Text', '{"tag":"content","max":4000}'],
      ['field', 'flair', 'enum', 'optional', '', 'Flair', '{"options":["tool","essay","talk"]}'],
      ['require-any', 'link', 'body'],
    ],
    content: 'Links and notes worth a look, curated by one key for the end-to-end run.',
    created_at: T0,
  })
}

const AUTHORS = ['e2e alice', 'e2e bob', 'e2e carol']
const FLAIRS = ['tool', 'essay', 'talk']

export function posts(): { suggestions: Event[]; canonicals: Event[] } {
  const suggestions: Event[] = []
  const canonicals: Event[] = []
  for (let i = 1; i <= 12; i++) {
    const author = AUTHORS[i % 3]
    const d = `thing-${i}`
    const suggestion = signedBy(author, {
      kind: 31888,
      tags: [
        ['d', d],
        ['title', `Thing number ${i}`],
        ['r', `https://example.org/things/${i}`, 'link'],
        ['flair', FLAIRS[i % 3]],
        ['a', ADDRESS, RELAY, 'root'],
        ['p', CURATOR],
        ['k', '31889'],
      ],
      content: i % 2 === 0 ? `Notes on thing ${i}, with a link to https://example.org/notes/${i} in the text.` : '',
      created_at: T0 + i * 60,
    })
    suggestions.push(suggestion)
    if (i <= 5) {
      canonicals.push(
        signedBy('e2e curator', {
          kind: 31890,
          tags: [
            ...suggestion.tags.filter((t) => t[0] !== 'p' || t[1] === CURATOR),
            ['a', `31888:${suggestion.pubkey}:${d}`, RELAY, 'mention'],
            ['e', suggestion.id, RELAY, 'mention'],
            ['p', suggestion.pubkey],
          ],
          content: suggestion.content,
          created_at: T0 + i * 60 + 30,
        }),
      )
    }
  }
  return { suggestions, canonicals }
}

/** A closed list by the same curator, for the refusal test: only the curator may suggest. */
export function closedSchemaEvent(): Event {
  return signedBy('e2e curator', {
    kind: 31889,
    tags: [
      ['d', 'closed-things'],
      ['title', 'closed things suggestion'],
      ['name', 'Closed things'],
      ['description', 'Only the curator suggests here.'],
      ['visibility', 'closed'],
      ['relay', RELAY],
      ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80}'],
      ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
    ],
    content: 'Only the curator suggests here.',
    created_at: T0,
  })
}

/**
 * A second list, for the comments run: one pending post that the run curates
 * from outside the page, so the main list's counts stay what list.spec expects.
 */
export const COMMENT_LIST = 'commented-things'
export const COMMENT_ADDRESS = `31889:${CURATOR}:${COMMENT_LIST}`

export function commentSchemaEvent(): Event {
  return signedBy('e2e curator', {
    kind: 31889,
    tags: [
      ['d', COMMENT_LIST],
      ['title', 'commented things suggestion'],
      ['name', 'Commented things'],
      ['description', 'One post, for the thread to survive curation.'],
      ['visibility', 'public'],
      ['relay', RELAY],
      ['field', 'identifier', 'token', 'required', '', 'Identifier', '{"tag":"d","max":80,"derived":true}'],
      ['field', 'title', 'text', 'required', '', 'Title', '{"max":200}'],
      ['field', 'link', 'url', 'optional', 'https://…', 'Link', '{"tag":"r","marker":"link","max":500}'],
    ],
    content: 'One post, for the thread to survive curation.',
    created_at: T0,
  })
}

export function commentPost(): Event {
  return signedBy('e2e alice', {
    kind: 31888,
    tags: [
      ['d', 'the-one'],
      ['title', 'The one that gets curated'],
      ['r', 'https://example.org/the-one', 'link'],
      ['a', COMMENT_ADDRESS, RELAY, 'root'],
      ['p', CURATOR],
      ['k', '31889'],
    ],
    content: '',
    created_at: T0 + 1000,
  })
}
