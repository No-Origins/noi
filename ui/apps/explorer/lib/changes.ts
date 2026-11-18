// Governance's changes in words (9 Nov), for its home: one plain sentence for each change to who
// may do what; and every entry of the record, for the record page (step 5). Governance sends the
// facts; this file only puts them into words.
import type { Change, RecordEntry } from './governance'
// With its .ts ending, so Node's test runner finds it too (9 Nov).
import { verbDoing, verbWords } from './sentence.ts'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A role by its own name where known (`proposer` → Proposer). */
const roleWords = (id: string | null, roles: Record<string, string>) => (id ? roles[id] ?? capital(id) : 'a role')

/** A role or rule a copy brought a new revision of: "noi.gov.roles.observer@5" → "Observer (revision 5)". */
function revisionWords(r: string, roles: Record<string, string>) {
  const [path, rev] = r.split('@')
  const id = path.split('.').pop() ?? path
  const name = path.startsWith('noi.gov.roles.') ? roleWords(id, roles) : `the rule ${id}`
  return rev ? `${name} (revision ${rev})` : name
}

/** At most `n` names, then how many more. */
function some(names: string[], n = 3) {
  if (names.length <= n) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('')
  return `${names.slice(0, n).join(', ')} and ${names.length - n} more`
}

/** One change as a sentence. `roles` names roles by their ID, from Mero. */
export function changeWords(c: Change, roles: Record<string, string> = {}): string {
  const by = c.by ?? 'Someone'
  const whom = c.whom ?? c.detail?.handle ?? 'an account'
  const where = c.scope ? ` in ${c.scope}` : ''
  switch (c.kind) {
    case 'setup':
      return `${by} set up Governance, as its first owner.`
    case 'grant':
      return `${by} gave ${whom} ${roleWords(c.role, roles)}${where}.`
    case 'end-grant':
      return `${by} ended ${whom}’s ${roleWords(c.role, roles)}${where}.`
    case 'add-agent':
      return `${by} added the agent ${c.detail?.handle ?? whom}${c.detail?.sponsor ? `, sponsored by ${c.detail.sponsor}` : ''}.`
    case 'voucher-add':
      return `${c.detail?.name ?? 'A platform'} may now vouch for agents.`
    case 'invite':
      return `${by} invited ${c.detail?.handle ?? whom}.`
    case 'sign-up':
      return `${c.detail?.handle ?? whom} signed up.`
    case 'copy':
      return c.changed?.length
        ? `${capital(some(c.changed.map(r => revisionWords(r, roles))))} changed in Mero.`
        : 'Roles and rules came from Mero.'
    default:
      return `${by}: ${c.kind}.`
  }
}

/** When, as the record's other pages say it: "8 Nov, 20:21". */
export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** What a touch on Your account was for (9 Nov): its intent's action. */
const OWN: Record<string, string> = {
  'add-my-passkey': 'adding a passkey',
  'remove-my-passkey': 'removing a passkey',
  'end-my-sign-in': 'ending one of their sign-ins',
  'end-my-other-sign-ins': 'ending their other sign-ins',
  'change-my-email': 'changing their email',
}
const doing = (action: string) => OWN[action] ?? verbDoing(action)

/** Where a decision was about: places by path, an account by its handle. */
function placesWords(e: RecordEntry) {
  const named = e.places.map(p => (p.startsWith('account:') ? (e.whom ?? 'an account') : p))
  return named.length ? some(named) : 'nowhere'
}

/** One entry of the record as a sentence, and for a refusal, Governance's reason. */
export function recordWords(e: RecordEntry, roles: Record<string, string> = {}): { text: string; why?: string } {
  const who = e.by === 'visitors' ? 'Someone signed out' : (e.by ?? 'Someone')
  const why = e.allowed ? undefined : e.reason
  const said = (text: string) => ({ text, why })
  const name = e.detail?.name ? ` “${e.detail.name}”` : ''
  switch (e.kind) {
    case 'decision':
      return e.allowed
        ? said(`${who} was allowed to ${verbWords(e.action ?? '')}: ${placesWords(e)}.`)
        : said(`${who} was refused ${doing(e.action ?? '')}: ${placesWords(e)}.`)
    case 'sign-in':
      return e.allowed ? said(`${who} signed in.`) : said(e.by ? `A sign-in as ${e.by} failed.` : 'A sign-in failed.')
    case 'sign-out':
      return said(e.reason === 'signed out' ? `${who} signed out.` : `${who} ${e.reason}.`)
    case 'touch':
      return e.allowed
        ? said(`${who} confirmed with Touch ID${e.detail?.intent?.action ? `, for ${doing(e.detail.intent.action)}` : ''}.`)
        : said(`A Touch ID for ${who} failed.`)
    case 'run-token':
      return e.allowed
        ? said(`${who} started a run${e.detail?.vouched_by ? `, vouched for by ${e.detail.vouched_by}` : ''}.`)
        : said(`A run for ${who} was refused.`)
    case 'passkey-add':
      return e.allowed ? said(`${who} added a passkey${name}.`) : said(`${who} couldn’t add a passkey.`)
    case 'passkey-remove':
      return said(`${who} removed a passkey${name}${e.detail?.sign_ins_ended ? `, ending the ${e.detail.sign_ins_ended === 1 ? 'sign-in' : `${e.detail.sign_ins_ended} sign-ins`} it made` : ''}.`)
    case 'first-passkey-link':
    case 'another-passkey-link':
      return said(`A link to add a passkey was made for ${who}${e.kind === 'another-passkey-link' ? ', on this Mac’s command line' : ''}.`)
    case 'lost-passkey-link':
      return e.allowed ? said(`A link for a lost passkey went to ${who}’s email.`) : said(`No link for a lost passkey went to ${who}: too many this hour.`)
    case 'email-change':
      return e.allowed
        ? said(`${who} asked to change their email: a link went to the new one.`)
        : said(`${who} asked to change their email to one that belongs to another account.`)
    case 'email-set':
      return said(`${who}’s email ${e.reason.includes('command line') ? 'was set on this Mac’s command line' : 'changed, from a link sent to it'}.`)
    case 'notice':
      return e.allowed
        ? said(`A notice went to ${who}’s email${e.detail?.about === 'passkey-add' ? ': a passkey was added' : e.detail?.about === 'email-change' ? ': their email changed' : ''}.`)
        : said(`No notice reached ${who}.`)
    case 'account-change':
      return said(`${who} was refused ${doing(e.detail?.change ?? 'a change')}, on Your account.`)
    case 'end-session':
      return said(`${who} ended ${e.whom ?? 'an account'}’s sign-ins${e.detail?.run_tokens ? ' and runs' : ''}.`)
    case 'limit':
      return said('Too many tries, from one place.')
    case 'sign-up':
      return e.allowed && e.by ? said(`${e.detail?.handle ?? who} signed up.`) : e.allowed ? said(`A sign-up for ${e.detail?.handle ?? 'a new handle'} waits for its email.`) : said('A sign-up used the email of an account; that email was told.')
    case 'copy':
      if (!e.allowed) return said('A copy of Mero’s roles and rules was refused.')
      return said(e.changed?.length ? changeWords(e, roles) : 'Mero’s roles and rules were copied; nothing changed.')
    default:
      return said(changeWords(e, roles))
  }
}
