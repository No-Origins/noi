// The one app on every system's own name (agreed 8 Nov): gov.<base> shows Governance's pages,
// mero.<base> Merons and Review, eidos.<base> the gallery, hyperbase.<base> Hyperbase Studio (the
// fourth name, 15 Nov). The base is one setting, NOI_DOMAIN, and it has two values only:
// no-origins.localhost on this Mac (macOS sends every *.localhost name here), no-origins.com hosted.
// Plain functions, tested on their own; the front desk (proxy.ts) and the pages use them.

export type System = 'gov' | 'mero' | 'eidos' | 'hyperbase'
/** A system's name, or the base name itself, where public profiles are (agreed 9 Nov). */
export type Name = System | 'base'

/** The two names No Origins answers on, and no other (the user, 18 Nov: "Across the application, our
    domain will be no-origins.com for production and no-origins.localhost in local"). Eidos's links know
    the same two (src/links/links.ts in @noi/eio-react); a test keeps them in step. */
export const NAMES = ['no-origins.com', 'no-origins.localhost'] as const

/** The base name NOI_DOMAIN chooses: one of the two names, no-origins.localhost when it is not set.
    Any other name is refused, so the app never starts on a name its own links would call outside. */
export function baseName(setting: string | undefined): string {
  const name = (setting ?? 'no-origins.localhost').trim().toLowerCase()
  if (!(NAMES as readonly string[]).includes(name)) {
    throw new Error(`NOI_DOMAIN is ${JSON.stringify(setting)}: No Origins answers only on ${NAMES.join(' and ')}`)
  }
  return name
}

/** The base name every system's name is under. */
export const DOMAIN = baseName(process.env.NOI_DOMAIN)

/** Systems whose pages are a folder of the app, shown at the top of their own name. */
const FOLDERS: [string, System][] = [['/gov', 'gov'], ['/eidos', 'eidos'], ['/hyperbase', 'hyperbase']]
/** Mero's pages keep their paths on mero's name. */
const MERO = ['/merons', '/review', '/designs']
const under = (path: string, folder: string) => path === folder || path.startsWith(folder + '/')

/** Someone's public profile: /@handle on the base name (agreed 9 Nov), the app's /at/<handle>
    folder (a folder can't start with @, which Next keeps for its own slots). */
const PROFILE = /^\/(?:@|%40)([^/]+)$/
const PROFILES = '/at'

/** Whose page a path of the app is, and where it is on that system's own name. */
export function owner(path: string): { system: Name; path: string } | undefined {
  if (under(path, PROFILES)) {
    const handle = path.slice(PROFILES.length + 1)
    return { system: 'base', path: handle ? `/@${handle}` : '/' }
  }
  for (const [folder, system] of FOLDERS) if (under(path, folder)) return { system, path: path.slice(folder.length) || '/' }
  if (MERO.some(f => under(path, f))) return { system: 'mero', path }
  return undefined
}

/** The system a name belongs to under the base name; 'base' for the base name itself. */
export function systemOf(hostname: string, domain = DOMAIN): System | 'base' | undefined {
  if (hostname === domain) return 'base'
  if (!hostname.endsWith('.' + domain)) return undefined
  const label = hostname.slice(0, -domain.length - 1)
  return label === 'gov' || label === 'mero' || label === 'eidos' || label === 'hyperbase' ? label : undefined
}

/** A Host header's name and port: "gov.no-origins.localhost:3000" → that name and "3000". */
export function splitHost(host: string): { hostname: string; port: string } {
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host.trim().toLowerCase())
  return m ? { hostname: m[1], port: m[2] ?? '' } : { hostname: '', port: '' }
}

/** A system's own address, or the base name's, in the scheme and on the port the app was reached on. */
export function originOf(system: Name, proto: string, port: string, domain = DOMAIN): string {
  return `${proto}://${system === 'base' ? '' : system + '.'}${domain}${port ? ':' + port : ''}`
}

export type Desk = { go: 'on' } | { go: 'rewrite'; path: string } | { go: 'redirect'; system: Name; path: string }

/** What the front desk does with a visit to this name and path: let it on, show a system's
    folder, or send it to the page's own name. */
export function frontDesk(hostname: string, path: string, domain = DOMAIN): Desk {
  const here = systemOf(hostname, domain)
  // Plain localhost sends you on to the page's own name (agreed 8 Nov); other names are left alone.
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  if (here === undefined && !local) return { go: 'on' }
  // A public profile is shown on the base name only (agreed 9 Nov).
  const profile = PROFILE.exec(path)
  if (profile) return here === 'base' ? { go: 'rewrite', path: `${PROFILES}/${profile[1]}` } : { go: 'redirect', system: 'base', path: `/@${profile[1]}` }
  const named = owner(path)
  if (here === undefined) return named ? { go: 'redirect', ...named } : { go: 'redirect', system: 'mero', path }
  // The base name is the front door, later; until then it is Mero's.
  if (here === 'base') return named ? { go: 'redirect', ...named } : { go: 'redirect', system: 'mero', path }
  if (named) {
    if (named.system !== here) return { go: 'redirect', ...named }
    // One address for each page: gov.…/gov/account/sign-in is gov.…/account/sign-in.
    return here === 'mero' ? { go: 'on' } : { go: 'redirect', system: here, path: named.path }
  }
  if (here === 'mero') return { go: 'on' }
  return { go: 'rewrite', path: `/${here}${path === '/' ? '' : path}` }
}

/** Gov's pages for getting in, and the link pages (under /account since 9 Nov): never a page to
    go back to. */
const GETTING_IN = ['/account/sign-in', '/account/sign-up', '/account/lost', '/account/link', '/account/email']

/** Where to go after signing in: a page on one of our own names, or a path on gov's; never
    another site, and never the sign-in or a link page itself. */
export function backTo(back: string | null | undefined, fallback: string, domain = DOMAIN): string {
  if (!back) return fallback
  // Nothing a URL parser drops or bends: "/<tab>/evil.example" read as a path, but a browser
  // drops the tab and goes to evil.example (found 9 Nov). So no control character, space or
  // backslash at all.
  if (/[\u0000-\u0020\u007f\\]/.test(back)) return fallback
  const own = (path: string) => !GETTING_IN.some(p => under(path, p) || under(path, '/gov' + p))
  if (back.startsWith('/')) {
    // A path on gov's own name: read as a browser would, it must stay on the name it started on.
    const here = 'http://here.invalid'
    let url: URL
    try {
      url = new URL(back, here)
    } catch {
      return fallback
    }
    if (url.origin !== here) return fallback
    return own(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : fallback
  }
  try {
    const url = new URL(back)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal(domain))) return fallback
    if (url.username || url.password) return fallback
    const system = systemOf(url.hostname, domain)
    if (system === undefined) return fallback
    if (system === 'gov' && !own(url.pathname)) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

/** Whether the base name is this Mac's own, where the sign-in cookie can't ask for HTTPS. */
export const isLocal = (domain = DOMAIN) => domain === 'localhost' || domain.endsWith('.localhost')

/** Where emails wait on this Mac, said on the forms that send one: the mail catcher's inbox. None
    hosted, where they are really sent. */
export const mailInbox = (domain = DOMAIN, inbox = process.env.NOI_MAIL_INBOX) =>
  isLocal(domain) ? (inbox ?? 'http://localhost:55324') : undefined
