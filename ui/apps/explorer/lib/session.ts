// Your sign-in, as the app's server hands it on: Governance makes the session and names it in its
// answer's cookie; the app gives your browser that cookie for the base name, so every system's
// name shares one sign-in (agreed 8 Nov). HttpOnly, so no page script can read it; SameSite lax, so
// Safari sends it from gov on to mero. Plain functions, tested on their own.

/** The cookie Governance names your session in. */
export const SESSION = 'noi_session'

export interface Session { token: string; maxAge?: number }

/** Governance's session, from its answer's Set-Cookie lines. Undefined when none carries one. */
export function sessionFrom(setCookies: string[]): Session | undefined {
  for (const line of setCookies) {
    const [pair, ...attributes] = line.split(';')
    const at = pair.indexOf('=')
    if (at < 0 || pair.slice(0, at).trim() !== SESSION) continue
    const token = pair.slice(at + 1).trim()
    if (!token) continue
    const age = attributes.map(a => a.trim().split('=')).find(([k]) => k.toLowerCase() === 'max-age')?.[1]
    const maxAge = Number(age)
    return Number.isFinite(maxAge) && maxAge > 0 ? { token, maxAge } : { token }
  }
  return undefined
}

/** Who is visiting, for Governance's limits on tries (found 9 Nov): only from a header the hosting
    service sets and a visitor cannot write, named by NOI_VISITOR_HEADER (such as x-real-ip), taking
    its last entry, the one the nearest proxy added. Without that setting, nobody: a visitor can send
    X-Forwarded-For themselves and Next keeps it, so on this Mac Governance counts this server. */
export function visitorOf(get: (name: string) => string | null, header: string | undefined): string | undefined {
  if (!header) return undefined
  const last = (get(header.toLowerCase()) ?? '').split(',').at(-1)?.trim()
  return last && last.length <= 64 ? last : undefined
}
