import path from 'node:path'
import type { NextConfig } from 'next'

// The Eidos packages ship TypeScript source and CSS; Next.js compiles them with the app.
// `standalone` (8 Nov): `next build` also writes a server with only the packages it uses, for the
// app's container image. Tracing starts at the repository's top, where the one pnpm workspace keeps
// the installed packages (8 Nov), so the server is at .next/standalone/ui/apps/explorer/server.js.
// `next dev` is unchanged.
const config: NextConfig = {
  transpilePackages: ['@noi/eio-react', '@noi/eio-tokens'],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../..'),
}

export default config
