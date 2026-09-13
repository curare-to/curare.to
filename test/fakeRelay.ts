import { WebSocketServer, type WebSocket } from 'ws'
import { matchFilters, type Filter } from 'nostr-tools/filter'
import { verifyEvent, type Event } from 'nostr-tools/pure'

/* ------------------------------------------------------------------ *
 * An in-process relay speaking the NIP-01 subset the site uses: EVENT,
 * REQ (with EOSE, then live), CLOSE. It stores whatever it is given
 * (a bad signature is refused with OK false, like a real relay would),
 * keeps only the newest version of an addressable event per pubkey:d,
 * and matches filters with nostr-tools' own matcher — so a store test
 * exercises the real SimplePool against real filters, just not the
 * network. `SimplePool` has no fake; this is the next best thing.
 * ------------------------------------------------------------------ */

interface Sub {
  socket: WebSocket
  id: string
  filters: Filter[]
}

const addressableKey = (event: Event): string | null => {
  if (event.kind < 30000 || event.kind >= 40000) return null
  const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? ''
  return `${event.kind}:${event.pubkey}:${d}`
}

export class FakeRelay {
  private server: WebSocketServer
  readonly events = new Map<string, Event>()
  private byAddress = new Map<string, string>()
  private subs = new Set<Sub>()
  /** Every REQ filter received, in order, for tests that assert on queries. */
  readonly requests: Filter[][] = []
  /** When set, every EVENT is refused with this reason — a relay with a write policy. */
  refuse: string | null = null
  readonly url: string

  private constructor(server: WebSocketServer, port: number) {
    this.server = server
    this.url = `ws://127.0.0.1:${port}`
    server.on('connection', (socket) => {
      socket.on('message', (raw) => this.handle(socket, String(raw)))
      socket.on('close', () => {
        for (const sub of this.subs) if (sub.socket === socket) this.subs.delete(sub)
      })
    })
  }

  /** A random port on loopback by default; a fixed port on every interface for the e2e run. */
  static async start(port = 0): Promise<FakeRelay> {
    const server = port === 0 ? new WebSocketServer({ host: '127.0.0.1', port: 0 }) : new WebSocketServer({ port })
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    const bound = typeof address === 'object' && address ? address.port : port
    return new FakeRelay(server, bound)
  }

  /** Seed the relay directly, as if the events had been published earlier. */
  seed(...events: Event[]): void {
    for (const event of events) this.store(event)
  }

  private store(event: Event): boolean {
    const key = addressableKey(event)
    if (key) {
      const currentId = this.byAddress.get(key)
      const current = currentId ? this.events.get(currentId) : undefined
      if (current && current.created_at > event.created_at) return false
      if (current) this.events.delete(current.id)
      this.byAddress.set(key, event.id)
    }
    this.events.set(event.id, event)
    return true
  }

  private handle(socket: WebSocket, raw: string): void {
    let message: unknown[]
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    const [verb] = message
    if (verb === 'EVENT') {
      const event = message[1] as Event
      if (this.refuse) {
        socket.send(JSON.stringify(['OK', event.id, false, `blocked: ${this.refuse}`]))
        return
      }
      if (!verifyEvent(event)) {
        socket.send(JSON.stringify(['OK', event.id, false, 'invalid: bad signature']))
        return
      }
      const stored = this.store(event)
      socket.send(JSON.stringify(['OK', event.id, true, stored ? '' : 'duplicate: older than the stored version']))
      if (stored) {
        for (const sub of this.subs) {
          if (matchFilters(sub.filters, event)) {
            sub.socket.send(JSON.stringify(['EVENT', sub.id, event]))
          }
        }
      }
      return
    }
    if (verb === 'REQ') {
      const id = String(message[1])
      const filters = message.slice(2) as Filter[]
      this.requests.push(filters)
      const sub: Sub = { socket, id, filters }
      this.subs.add(sub)
      const matching = [...this.events.values()]
        .filter((event) => matchFilters(filters, event))
        .sort((a, b) => b.created_at - a.created_at)
      const limit = Math.min(...filters.map((f) => f.limit ?? Infinity))
      for (const event of matching.slice(0, limit)) {
        socket.send(JSON.stringify(['EVENT', id, event]))
      }
      socket.send(JSON.stringify(['EOSE', id]))
      return
    }
    if (verb === 'CLOSE') {
      const id = String(message[1])
      for (const sub of this.subs) if (sub.socket === socket && sub.id === id) this.subs.delete(sub)
    }
  }

  async close(): Promise<void> {
    for (const client of this.server.clients) client.terminate()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }
}
