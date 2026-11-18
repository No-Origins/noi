import path from 'node:path'
import type { NextConfig } from 'next'
import { baseName } from './lib/hosts'

// The Eidos packages ship TypeScript source and CSS; Next.js compiles them with the app.
// `standalone` (8 Nov): `next build` also writes a server with only the packages it uses, for the
// app's container image. Tracing starts at the repository's top, where the one pnpm workspace keeps
// the installed packages (8 Nov), so the server is at .next/standalone/ui/apps/explorer/server.js.
// `next dev` is unchanged.
// No server function calls in the log (8 Nov): `next dev` would print each call with what it was
// given, such as a one-time link's token or a passkey's answer. Nothing secret goes in a log.
// Every system's own name may load the dev server's files (8 Nov): gov, mero and eidos under the base
// name, no-origins.localhost on this Mac.
// NOI_DOMAIN is one of the two names (18 Nov): any other stops `next dev` and `next build` here.
const domain = baseName(process.env.NOI_DOMAIN)
const config: NextConfig = {
  allowedDevOrigins: [domain, `*.${domain}`],
  logging: { serverFunctions: false },
  transpilePackages: ['@noi/eio-3d', '@noi/eio-react', '@noi/eio-tokens'],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../..'),
}

export default config
