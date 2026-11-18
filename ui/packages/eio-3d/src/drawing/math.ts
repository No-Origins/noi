// The eye's sums, moved from the 3D world page as written: a perspective, an eye looking at a point
// with up straight up, two matrices multiplied, and where a point lands on the screen.
export type Vec3 = [number, number, number]
export type Mat4 = ArrayLike<number>

export function perspective(fovy: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]
}

export function lookAt(e: Vec3, t: Vec3): number[] {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2], l = Math.hypot(zx, zy, zz)
  zx /= l; zy /= l; zz /= l
  let xx = zz, xz = -zx
  const xy = 0
  l = Math.hypot(xx, xz); xx /= l; xz /= l
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]
}

export function mul(a: Mat4, b: Mat4): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return o
}

/** Where a point of the world lands in a picture `w` by `h`, or null when it is behind the eye. */
export function project(m: Mat4, p: Vec3, w: number, h: number): [number, number] | null {
  const q = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  if (q <= 0.01) return null
  return [((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / q * 0.5 + 0.5) * w,
    (0.5 - (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / q * 0.5) * h]
}
