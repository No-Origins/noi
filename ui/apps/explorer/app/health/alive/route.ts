// Health (agreed 8 Nov): the app is running. A host restarts it when this stops answering.
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ ok: true })
}
