// Roles and rules in words (agreed 8 Nov). Mero reads a rule's Cedar into five parts and writes
// it back; this file only puts those parts into a sentence, for the editor, the rule's page and
// Review. It never reads or writes Cedar itself.

export type Effect = 'forbid' | 'permit'
export type Who = 'anyone' | { role: string } | { account: string }
export type Pick = { pick: 'every'; except: string[] } | { pick: 'these'; verbs: string[] }
export type Doing = { system: string } & Pick
export type Where = 'everywhere' | { place: string }
export type Condition = 'fresh-touch' | { holds: string }
export interface RuleForm { effect: Effect; who: Who; doing: Doing[]; where: Where; unless: Condition[] }
/** A role: one system, and every one of its actions or some of them. */
export type RoleForm = Doing
/** Either form. */
export type AnyReadingForm = RuleForm | RoleForm
/** What Mero read: the form, or why the Cedar is written by hand. */
export type Reading<F> = { form: F } | { by_hand: string }

/** The words for each verb: what it lets you do, and the same as "it's …" for an exception. */
const VERBS: Record<string, [string, string]> = {
  read: ['read merons', 'reading'],
  propose: ['propose changes', 'proposing'],
  update: ['update merons', 'an update'],
  'evolve-breaking': ['make breaking changes', 'a breaking change'],
  rename: ['rename merons', 'a rename'],
  transition: ['move merons through their lifecycle', 'a lifecycle move'],
  relate: ['link merons', 'linking'],
  unrelate: ['unlink merons', 'unlinking'],
  release: ['plan releases', 'planning a release'],
  'transition-release': ['move releases forward', 'moving a release forward'],
  review: ['approve, send back or reject in Review', 'deciding in Review'],
  invite: ['invite people', 'inviting'],
  'add-agent': ['add agents', 'adding an agent'],
  'change-account': ['change accounts', 'changing an account'],
  'remove-passkey': ['remove passkeys', 'removing a passkey'],
  grant: ['grant roles', 'granting a role'],
  'end-grant': ['end grants', 'ending a grant'],
  'end-session': ['end sign-ins', 'ending a sign-in'],
  view: ['view accounts, roles and the record', 'viewing'],
}
const SYSTEM: Record<string, string> = { mero: 'Mero', governance: 'Governance' }

export const systemName = (s: string) => SYSTEM[s] ?? s
/** What a verb lets you do, such as "propose changes". */
export const verbWords = (v: string) => VERBS[v]?.[0] ?? v
const verbAsIt = (v: string) => VERBS[v]?.[1] ?? v

/** Names for roles and accounts, where known: `owner` → Owner, an account's ID → its handle. */
export interface Names { roles?: Record<string, string>; accounts?: Record<string, string> }
const roleName = (r: string, n: Names) => n.roles?.[r] ?? r.charAt(0).toUpperCase() + r.slice(1)
const accountName = (a: string, n: Names) => n.accounts?.[a] ?? `the account ${a.slice(0, 8)}`

/** A piece of a sentence. `added` and `removed` mark what differs from the other side of a change. */
export interface Seg { text: string; mark?: 'added' | 'removed' }
/** One part of a sentence, with a key that says whether the other side has it too. */
interface Item { key: string; text: string }

function joinItems(items: Item[], other: Set<string> | undefined, mark: Seg['mark'], last: string): Seg[] {
  const segs: Seg[] = []
  items.forEach((it, i) => {
    if (i > 0) segs.push({ text: i === items.length - 1 ? last : ', ' })
    segs.push(other && !other.has(it.key) ? { text: it.text, mark } : { text: it.text })
  })
  return segs
}

function ruleItems(f: RuleForm, n: Names) {
  const whoKey = typeof f.who === 'string' ? f.who : 'role' in f.who ? `role:${f.who.role}` : `account:${f.who.account}`
  const subject = f.who === 'anyone'
    ? (f.effect === 'forbid' ? 'No one may' : 'Anyone may')
    : `${'role' in f.who ? `Holders of ${roleName(f.who.role, n)}` : accountName(f.who.account, n)} ${f.effect === 'forbid' ? 'may not' : 'may'}`
  const doing: Item[] = f.doing.flatMap(d => d.pick === 'every'
    ? [{ key: `every:${d.system}`, text: `do any ${systemName(d.system)} action` }]
    : d.verbs.map(v => ({ key: `verb:${v}`, text: verbWords(v) })))
  const where: Item = f.where === 'everywhere'
    ? { key: 'everywhere', text: 'anywhere' }
    : { key: `place:${f.where.place}`, text: `in ${f.where.place}` }
  const unless: Item[] = [
    ...f.unless.map(c => c === 'fresh-touch'
      ? { key: 'fresh-touch', text: 'they touched just now' }
      : { key: `holds:${c.holds}`, text: `they hold ${roleName(c.holds, n)}` }),
    ...f.doing.flatMap(d => d.pick === 'every' ? d.except.map(v => ({ key: `except:${v}`, text: `it’s ${verbAsIt(v)}` })) : []),
  ]
  return { subject: { key: `${f.effect}:${whoKey}`, text: subject }, doing, where, unless }
}

const keysOf = (x: ReturnType<typeof ruleItems>) =>
  new Set([x.subject.key, x.where.key, ...x.doing.map(i => i.key), ...x.unless.map(i => i.key)])

/** A rule as one sentence. Given the other side of a change, what differs is marked. */
export function ruleSentence(f: RuleForm, n: Names = {}, other?: RuleForm, mark: Seg['mark'] = 'added'): Seg[] {
  const me = ruleItems(f, n)
  const theirs = other ? keysOf(ruleItems(other, n)) : undefined
  const one = (it: Item): Seg => (theirs && !theirs.has(it.key) ? { text: it.text, mark } : { text: it.text })
  const segs: Seg[] = [one(me.subject), { text: ' ' }, ...joinItems(me.doing, theirs, mark, ', or '), { text: ', ' }, one(me.where)]
  if (me.unless.length) segs.push({ text: ', unless ' }, ...joinItems(me.unless, theirs, mark, ', or '))
  segs.push({ text: '.' })
  return segs
}

/** A role as one sentence. Given the other side of a change, what differs is marked. */
export function roleSentence(f: RoleForm, other?: RoleForm, mark: Seg['mark'] = 'added'): Seg[] {
  const items = (r: RoleForm): Item[] => r.pick === 'every'
    ? [{ key: `every:${r.system}`, text: `do any ${systemName(r.system)} action, including ones added later` }]
    : r.verbs.map(v => ({ key: `verb:${v}`, text: verbWords(v) }))
  const theirs = other ? new Set(items(other).map(i => i.key)) : undefined
  return [{ text: 'Lets its holders ' }, ...joinItems(items(f), theirs, mark, ', and '), { text: ', wherever it’s granted.' }]
}

/** The plain text of a sentence. */
export const plain = (segs: Seg[]) => segs.map(s => s.text).join('')
