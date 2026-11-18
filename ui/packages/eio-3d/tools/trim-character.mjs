// Makes a small copy of one of the old project's rigged characters (made with Meshy.ai), for @noi/eio-3d.
// Moved from the 3D world's tools (its trim-character.mjs), with one change: pictures packed inside the
// model are taken out (the look is a picture of its own, put on by the drawing code, as the world does
// for Clay), so a model that came with packed pictures stays a good file.
//
// It keeps the mesh, the bones and the named clips, drops the rest, and stores each point's bone weights
// as four small numbers (0 to 255) where they were four large ones. Nothing about the shape, the bones or
// the kept clips changes. No library is used.
//
// usage: node tools/trim-character.mjs IN.glb IN-LOOK.(jpg|png|webp) OUT_DIR NAME Clip_A Clip_B ...
//   writes OUT_DIR/NAME.glb and OUT_DIR/NAME.jpg (the look, 1024 across); needs ImageMagick ("magick").
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [src, tex, outDir, name, ...keep] = process.argv.slice(2)
if (!src || !tex || !outDir || !name || !keep.length) {
  console.error('usage: node trim-character.mjs IN.glb IN-TEXTURE.jpg OUT_DIR NAME Clip_A Clip_B ...')
  process.exit(2)
}
const glb = fs.readFileSync(src)
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb file')
const jsonLen = glb.readUInt32LE(12)
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'))
const bin = glb.subarray(20 + jsonLen + 8, 20 + jsonLen + 8 + glb.readUInt32LE(20 + jsonLen))

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
// the bytes of one accessor, tightly packed, whatever the stride it was stored with
function bytesOf(i) {
  const a = json.accessors[i], v = json.bufferViews[a.bufferView]
  const size = COMP[a.componentType] * NUM[a.type], stride = v.byteStride || size
  const start = (v.byteOffset || 0) + (a.byteOffset || 0)
  if (stride === size) return Buffer.from(bin.subarray(start, start + a.count * size))
  const out = Buffer.alloc(a.count * size)
  for (let k = 0; k < a.count; k++) bin.copy(out, k * size, start + k * stride, start + k * stride + size)
  return out
}

// pictures packed inside the model are taken out: the drawing code puts the look on
delete json.images; delete json.textures; delete json.samplers
for (const m of json.materials || []) {
  if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture }
  delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture
}
if (json.extensionsUsed) json.extensionsUsed = json.extensionsUsed.filter(e => !/texture/i.test(e))

// the clips to keep
const anims = (json.animations || []).filter(a => keep.includes(a.name))
const missing = keep.filter(n => !anims.some(a => a.name === n))
if (missing.length) throw new Error('no such clip: ' + missing.join(', ') + '. There are: ' + (json.animations || []).map(a => a.name).join(', '))

// every accessor still in use, and what it is used for
const used = new Map()                      // old index -> { target, weights }
const use = (i, extra = {}) => { if (i != null) used.set(i, { ...(used.get(i) || {}), ...extra }) }
for (const m of json.meshes || []) for (const p of m.primitives) {
  for (const [k, i] of Object.entries(p.attributes)) use(i, { target: 34962, weights: k.startsWith('WEIGHTS_') })
  use(p.indices, { target: 34963 })
  if (p.targets) throw new Error('this file has shape keys, which this script does not carry over')
}
for (const s of json.skins || []) use(s.inverseBindMatrices)
for (const a of anims) for (const s of a.samplers) { use(s.input); use(s.output) }

// pack them again, one after another
const remap = new Map(), parts = [], views = [], accessors = []
let at = 0
for (const [old, how] of [...used.entries()].sort((a, b) => a[0] - b[0])) {
  const a = { ...json.accessors[old] }
  let bytes = bytesOf(old)
  if (how.weights && a.componentType === 5126 && a.type === 'VEC4') {
    // four weights that add up to 1, as four whole numbers that add up to 255
    const out = Buffer.alloc(a.count * 4)
    for (let k = 0; k < a.count; k++) {
      const w = [0, 1, 2, 3].map(j => bytes.readFloatLE(k * 16 + j * 4))
      const sum = w.reduce((x, y) => x + y, 0) || 1
      const q = w.map(x => Math.round(x / sum * 255))
      let big = 0; for (let j = 1; j < 4; j++) if (q[j] > q[big]) big = j
      q[big] += 255 - q.reduce((x, y) => x + y, 0)
      for (let j = 0; j < 4; j++) out[k * 4 + j] = q[j]
    }
    bytes = out; a.componentType = 5121; a.normalized = true; delete a.min; delete a.max
  }
  const pad = (4 - at % 4) % 4
  if (pad) { parts.push(Buffer.alloc(pad)); at += pad }
  const view = { buffer: 0, byteOffset: at, byteLength: bytes.length }
  if (how.target) view.target = how.target
  views.push(view); parts.push(bytes); at += bytes.length
  delete a.byteOffset; a.bufferView = views.length - 1
  remap.set(old, accessors.length); accessors.push(a)
}
const R = i => remap.get(i)
for (const m of json.meshes || []) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = R(p.attributes[k])
  if (p.indices != null) p.indices = R(p.indices)
}
for (const s of json.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = R(s.inverseBindMatrices)
for (const a of anims) for (const s of a.samplers) { s.input = R(s.input); s.output = R(s.output) }
json.animations = anims
json.accessors = accessors
json.bufferViews = views
const padEnd = (4 - at % 4) % 4
if (padEnd) { parts.push(Buffer.alloc(padEnd)); at += padEnd }
json.buffers = [{ byteLength: at }]
json.asset = { ...(json.asset || {}), version: '2.0' }

let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - jsonBytes.length % 4, 0x20)])
const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8)
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + at, 8)
jh.writeUInt32LE(jsonBytes.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
bh.writeUInt32LE(at, 0); bh.writeUInt32LE(0x004e4942, 4)
const outGlb = Buffer.concat([head, jh, jsonBytes, bh, ...parts])

fs.mkdirSync(outDir, { recursive: true })
const glbPath = path.join(outDir, name + '.glb'), jpgPath = path.join(outDir, name + '.jpg')
fs.writeFileSync(glbPath, outGlb)
execFileSync('magick', [tex, '-resize', '1024x1024', '-quality', '84', jpgPath])
const mb = n => (n / 1e6).toFixed(2) + ' MB'
console.log(`${name}: ${mb(glb.length)} -> ${mb(outGlb.length)} with ${anims.length} clips (${anims.map(a => a.name).join(', ')}); look ${mb(fs.statSync(jpgPath).size)}`)
