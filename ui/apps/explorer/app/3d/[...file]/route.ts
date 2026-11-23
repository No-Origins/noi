// The 3D world's character files, served from @noi/eio-3d's assets (17 Nov): each character's model, its look and
// the Fairy Bot's wings, loaded when a character is first shown (world.ts, ASSETS), on any of the app's names (the
// front desk lets /3d through, proxy.ts). Only those files: names of small letters, figures and dashes, ending
// .glb or .jpg, inside the folder.
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(process.cwd(), 'node_modules', '@noi', 'eio-3d', 'assets')
const TYPES: Record<string, string> = { '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg' }
const notHere = () => new Response('Not here', { status: 404 })

export async function GET(_: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const parts = (await params).file
  if (!parts.length || !parts.every(p => /^[a-z0-9-]+(\.(glb|jpg))?$/.test(p))) return notHere()
  const file = path.join(ROOT, ...parts), type = TYPES[path.extname(file)]
  if (!type || !file.startsWith(ROOT + path.sep)) return notHere()
  try {
    return new Response(new Uint8Array(await readFile(file)), { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } })
  } catch {
    return notHere()
  }
}
