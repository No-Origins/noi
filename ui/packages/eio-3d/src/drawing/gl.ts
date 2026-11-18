// Small helpers for drawing with the browser's own 3D (WebGL 2), moved from the 3D world page.
import type { Vec3 } from './math.ts'

/** Which of a face's four borders are edges of the shape. Solid things ask for none (the user, 17 Nov). */
export const NONE: readonly number[] = [0, 0, 0, 0]

/** One flat face with four corners: a, b, c, d in turn, its normal n, and its edge flags m. */
export type Quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, m: readonly number[]) => void

/** Fourteen numbers a corner: where (3), its normal (3), where on its face and the face's size (4),
 * and its edge flags (4). Two triangles a face. */
export const FLOATS = 14

export function pusher(out: number[]): Quad {
  return (a, b, c, d, n, m) => {
    const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), v = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2])
    const corners: [Vec3, number, number][] = [[a, 0, 0], [b, w, 0], [c, w, v], [a, 0, 0], [c, w, v], [d, 0, v]]
    for (const [k, x, y] of corners) out.push(k[0], k[1], k[2], n[0], n[1], n[2], x, y, w, v, m[0], m[1], m[2], m[3])
  }
}

export interface Program { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

export function program(gl: WebGL2RenderingContext, vs: string, fs: string, names: string[]): Program {
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link')
  const u: Program['u'] = {}
  for (const n of names) u[n] = gl.getUniformLocation(p, n)
  return { p, u }
}

export interface Mesh { vao: WebGLVertexArrayObject; buf: WebGLBuffer; n: number }

export function mesh(gl: WebGL2RenderingContext, data: Float32Array): Mesh {
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  const step = FLOATS * 4
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, step, 0)
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, step, 12)
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, step, 24)
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, step, 40)
  return { vao, buf, n: data.length / FLOATS }
}

export function dropMesh(gl: WebGL2RenderingContext, m: Mesh | null) {
  if (!m) return
  gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.buf)
}

/** A colour Eidos gives as #RRGGBB, as the three numbers the graphics card wants. */
export function colourOf(hex: string): Vec3 {
  const n = parseInt(hex.trim().replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
