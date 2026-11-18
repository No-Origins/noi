// Where an address leads (agreed 18 Nov, "Links Drawn by Eidos"): inside No Origins, a Button that
// is a link stays a button with the arrow; outside, it is words with a dashed underline, in a new tab.

/** The names No Origins answers on: no-origins.com, and no-origins.localhost on this Mac. */
const NO_ORIGINS = /(^|\.)no-origins\.(com|localhost)$/

/** A page of No Origins, to read a path or a part of a page against: a plain path stays inside. */
const HERE = 'https://no-origins.com/'

/** Whether an address is inside No Origins: a path, a part of this page, or a name of No Origins.
 * Any other site, and any other kind of address (mail, a phone number), is outside. The address is read
 * the way a browser reads it (the URL standard: a backslash is a slash, tabs and newlines are dropped,
 * a name and password before @ are not the site), so what is said here is where the link really goes.
 * An address a browser cannot read is outside. */
export function insideNoOrigins(href: string): boolean {
  let url: URL
  try {
    url = new URL(href, HERE)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  return NO_ORIGINS.test(url.hostname)
}
