import type { FieldDef } from './curated'
import { ruleHint, type DeriveRule } from './derive'

/* ------------------------------------------------------------------ *
 * The reddit-shaped default schemas a sub can start from. Every template
 * carries the mandatory d and title fields, records its d rule in the
 * identifier field's hint, and declares no derived `t` field: the copied
 * module's hashtag rule is bitcoin.mov's, and a sub is its own topic —
 * flair is the sub-topic.
 * ------------------------------------------------------------------ */

export interface SchemaTemplate {
  /** Stable key, used in the URL of the sub editor. */
  key: string
  name: string
  description: string
  rule: DeriveRule
  fields: FieldDef[]
  requireAny: string[][]
}

export const identifierField = (rule: DeriveRule): FieldDef => ({
  name: 'identifier',
  type: 'token',
  required: true,
  placeholder: '',
  label: 'Identifier',
  config: { tag: 'd', max: 80, derived: true, hint: ruleHint(rule) },
})

const title = (placeholder: string): FieldDef => ({
  name: 'title',
  type: 'text',
  required: true,
  placeholder,
  label: 'Title',
  config: { max: 200 },
})

const flair = (options: string[]): FieldDef => ({
  name: 'flair',
  type: 'enum',
  required: false,
  placeholder: '',
  label: 'Flair',
  config: { options },
})

export const TEMPLATES: SchemaTemplate[] = [
  {
    key: 'links',
    name: 'Links & text',
    description: 'Reddit’s default: a title with a link or some text, a picture if you like, and a flair.',
    rule: 'link-or-title',
    fields: [
      identifierField('link-or-title'),
      title('What is it?'),
      { name: 'link', type: 'url', required: false, placeholder: 'https://…', label: 'Link', config: { tag: 'r', marker: 'link', max: 500 } },
      { name: 'body', type: 'longtext', required: false, placeholder: 'Say more, or nothing.', label: 'Text', config: { tag: 'content', max: 10000 } },
      { name: 'image', type: 'image', required: false, placeholder: 'https://…/picture.jpg', label: 'Picture', config: { max: 500, hint: 'An https link to an image.' } },
      flair(['discussion', 'news', 'question']),
    ],
    requireAny: [['link', 'body']],
  },
  {
    key: 'discussion',
    name: 'Discussion',
    description: 'Text posts only: a title and a body, with a flair.',
    rule: 'title-author',
    fields: [
      identifierField('title-author'),
      title('What do you want to talk about?'),
      { name: 'body', type: 'longtext', required: true, placeholder: '', label: 'Text', config: { tag: 'content', max: 10000 } },
      flair(['question', 'meta']),
    ],
    requireAny: [],
  },
  {
    key: 'catalogue',
    name: 'Catalogue',
    description: 'bitcoin.mov’s shape: things with a year, a type, an external id and links — one entry per thing however often it is suggested.',
    rule: 'external-or-title-year',
    fields: [
      identifierField('external-or-title-year'),
      title('The thing’s name'),
      { name: 'year', type: 'year', required: false, placeholder: '2014', label: 'Year', config: { min: 1900, max: 2100 } },
      { name: 'type', type: 'enum', required: true, placeholder: '', label: 'Type', config: { options: ['movie', 'documentary', 'short', 'series', 'book', 'other'] } },
      { name: 'externalId', type: 'token', required: false, placeholder: 'imdb:tt2821314', label: 'External id', config: { tag: 'i', max: 60, hint: 'Helps dedupe, e.g. imdb:tt2821314 or isbn:…' } },
      { name: 'watchUrl', type: 'url', required: false, placeholder: 'https://…', label: 'Where to see it', config: { tag: 'r', marker: 'watch', max: 500, repeat: true } },
      { name: 'referenceUrl', type: 'url', required: false, placeholder: 'https://…', label: 'Reference', config: { tag: 'r', marker: 'reference', max: 500 } },
      { name: 'image', type: 'image', required: false, placeholder: 'https://…/poster.jpg', label: 'Picture', config: { max: 500 } },
      { name: 'lang', type: 'token', required: false, placeholder: 'en', label: 'Language', config: { max: 60, pattern: '[A-Za-z]{2,8}([-_][A-Za-z0-9]{2,8})*' } },
      { name: 'description', type: 'longtext', required: false, placeholder: 'Why is it worth a look?', label: 'Description', config: { tag: 'content', max: 4000 } },
    ],
    requireAny: [['watchUrl', 'referenceUrl']],
  },
  {
    key: 'custom',
    name: 'Custom',
    description: 'Just the two fields every list has — an identifier and a title — and whatever you add.',
    rule: 'title',
    fields: [identifierField('title'), title('')],
    requireAny: [],
  },
]

export function templateByKey(key: string | null | undefined): SchemaTemplate {
  return TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0]
}
