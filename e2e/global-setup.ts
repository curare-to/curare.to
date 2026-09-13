import fs from 'node:fs'
import path from 'node:path'
import { FakeRelay } from '../test/fakeRelay'
import { banPosts, banSchemaEvent, closedSchemaEvent, commentPost, commentSchemaEvent, modPosts, modSchemaEvent, posts, schemaEvent } from './list'

/**
 * Start the local relay on the port bitcoin.mov's dev setup uses, and put the
 * run's lists on it. The relay lives for the whole run; the returned function
 * stops it. For the single-list run (SINGLE=1) the main list's signed schema
 * is also written where e2e/serve.mjs overlays it at the well-known path.
 */
export default async function globalSetup() {
  const relay = await FakeRelay.start(10547)
  const { suggestions, canonicals } = posts()
  relay.seed(schemaEvent(), closedSchemaEvent(), commentSchemaEvent(), commentPost(), modSchemaEvent(), ...modPosts(), banSchemaEvent(), ...banPosts(), ...suggestions, ...canonicals)

  if (process.env.SINGLE) {
    const file = path.resolve(__dirname, '.single', '.well-known', 'curare.to', 'nostr.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(schemaEvent()))
  }

  return async () => {
    await relay.close()
  }
}
