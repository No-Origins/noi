// How the app's server talks to Mero and Governance (architecture review, 9 Nov): never waiting
// longer than a time limit, and never passing on a server's own failure in its words. Its reason
// stays in that server's log and on the Problems page.
import { isLocal } from './hosts'

/** How long the app waits for a read, and for a write (an approval may export tokens or copy the
    roles and rules; a sign-up sends an email). */
export const READ_MS = 10_000
export const WRITE_MS = 30_000

type Server = 'Mero' | 'Governance'
const COMMAND: Record<Server, string> = { Mero: 'noi serve', Governance: 'noi gov serve' }

/** A server that doesn't answer: on this Mac, how to start it; hosted, nothing more. */
export const notAnswering = (server: Server) =>
  `${server} isn’t answering.${isLocal() ? ` Is \`${COMMAND[server]}\` running?` : ''}`

/** An answer that isn't a success: the server's own words for a refusal, plain ones for its own
    failure. */
export const errorOf = (server: Server, status: number, said?: string) =>
  status >= 500 ? `${server} couldn’t answer. Try again in a moment.` : (said ?? `${server} answered ${status}.`)
