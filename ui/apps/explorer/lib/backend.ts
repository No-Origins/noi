// How the app's server talks to Mero and Governance (architecture review, 9 Nov): never waiting
// longer than a time limit, and never passing on a server's own failure in its words. Its reason
// stays in that server's log and on the Problems page.
import { isLocal } from './hosts.ts'

/** How long the app waits for a read, and for a write (an approval may export tokens or copy the
    roles and rules; a sign-up sends an email). */
export const READ_MS = 10_000
export const WRITE_MS = 30_000

export type Server = 'Mero' | 'Governance'
const COMMAND: Record<Server, string> = { Mero: 'noi serve', Governance: 'noi gov serve' }
/** The setting that gives the app each server's address. */
const SETTING: Record<Server, string> = { Mero: 'MERO_URL', Governance: 'GOVERNANCE_API' }

/** Whether a server is not on the internet yet (20 Nov, the app on Vercel before Mero and Governance
    are hosted): the app runs hosted and was given no address for it. On this Mac each server has its
    own address without a setting, so this is never so here. */
export const notHostedYet = (server: Server, env: Record<string, string | undefined> = process.env, domain?: string) =>
  !isLocal(domain) && !env[SETTING[server]]

/** What a page says when the server it needs is not on the internet yet, in plain words and with no
    "try again" (the user, 20 Nov): a heading and one line. `doing` names what waits for it, such as
    "Signing in". */
export function notHostedWords(server: Server, doing?: string): { title: string; line: string } {
  return doing
    ? { title: `${doing} comes later`, line: `${server} isn’t on the internet yet. ${doing} works on the maintainer’s Mac for now.` }
    : { title: `${server} isn’t on the internet yet`, line: 'This page works on the maintainer’s Mac for now.' }
}

/** A server that doesn't answer: on this Mac, how to start it; hosted with no address for it, that it
    is not on the internet yet; hosted, nothing more. */
export const notAnswering = (server: Server) => {
  if (notHostedYet(server)) {
    const { title, line } = notHostedWords(server)
    return `${title}. ${line}`
  }
  return `${server} isn’t answering.${isLocal() ? ` Is \`${COMMAND[server]}\` running?` : ''}`
}

/** An answer that isn't a success: the server's own words for a refusal, plain ones for its own
    failure. */
export const errorOf = (server: Server, status: number, said?: string) =>
  status >= 500 ? `${server} couldn’t answer. Try again in a moment.` : (said ?? `${server} answered ${status}.`)
