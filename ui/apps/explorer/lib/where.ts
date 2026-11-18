// Each system's own address, as this visit reached the app: the same scheme and port, on the
// system's name under the base name (agreed 8 Nov), and the base name itself, where public profiles
// are (9 Nov). For links between systems, such as the tabs.
import 'server-only'
import { headers } from 'next/headers'
import { originOf, splitHost, type Name } from './hosts'

export async function origins(): Promise<Record<Name, string>> {
  const h = await headers()
  const { port } = splitHost(h.get('host') ?? '')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return { base: originOf('base', proto, port), gov: originOf('gov', proto, port), mero: originOf('mero', proto, port), eidos: originOf('eidos', proto, port), hyperbase: originOf('hyperbase', proto, port) }
}
