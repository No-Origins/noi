// Health (agreed 8 Nov): the app can do its job when Mero and Governance answer. No sign-in, and
// nothing but "ok" or which part is not ok.
export const dynamic = 'force-dynamic'

const MERO_URL = process.env.MERO_URL ?? 'http://127.0.0.1:8787'
const GOVERNANCE_API = process.env.GOVERNANCE_API ?? 'http://127.0.0.1:8788'

async function answers(url: string) {
  try {
    const res = await fetch(`${url}/health/alive`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  const [mero, governance] = await Promise.all([answers(MERO_URL), answers(GOVERNANCE_API)])
  const ok = mero && governance
  const say = (x: boolean) => (x ? 'ok' : 'not ok')
  return Response.json({ ok, checks: { mero: say(mero), governance: say(governance) } }, { status: ok ? 200 : 503 })
}
