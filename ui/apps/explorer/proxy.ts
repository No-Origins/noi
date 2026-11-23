// The front desk (agreed 8 Nov): the one app answers on every system's own name and shows that
// system's pages. gov.<base>/account/sign-in shows app/gov/account/sign-in, eidos.<base> the gallery,
// hyperbase.<base>/projects shows app/hyperbase/projects (Hyperbase Studio, 15 Nov), and
// mero.<base> Merons and Review as they are. A page asked for under another name, or under plain
// localhost, is sent to its own name. Health checks, Next's own files and the 3D world's files (/3d: the
// characters' models and looks, which a page on any name may show, 23 Nov) pass straight through.
import { NextResponse, type NextRequest } from 'next/server'
import { frontDesk, originOf, splitHost } from './lib/hosts'

export function proxy(request: NextRequest) {
  const { hostname, port } = splitHost(request.headers.get('host') ?? '')
  const desk = frontDesk(hostname, request.nextUrl.pathname)
  if (desk.go === 'on') return NextResponse.next()
  if (desk.go === 'rewrite') {
    // From the request's own address, not nextUrl: nextUrl turns 127.0.0.1 into localhost, and a
    // rewrite to another origin goes out as a new request instead of staying inside (9 Nov, once
    // the app listened on this Mac only).
    return NextResponse.rewrite(new URL(desk.path + request.nextUrl.search, request.url))
  }
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(/:$/, '')
  return NextResponse.redirect(`${originOf(desk.system, proto, port)}${desk.path}${request.nextUrl.search}`, 307)
}

export const config = {
  matcher: ['/((?!_next/|health/|favicon\\.ico|3d/).*)'],
}
