import { FakeRelay } from '../test/fakeRelay'
import { closedSchemaEvent, posts, schemaEvent } from './list'

/**
 * Start the local relay on the port bitcoin.mov's dev setup uses, and put the
 * run's list on it. The relay lives for the whole run; the returned function
 * stops it.
 */
export default async function globalSetup() {
  const relay = await FakeRelay.start(10547)
  const { suggestions, canonicals } = posts()
  relay.seed(schemaEvent(), closedSchemaEvent(), ...suggestions, ...canonicals)
  return async () => {
    await relay.close()
  }
}
