// hyperbase.<base>/world · THE NEW 3D WORLD (21 Nov 2026), on the whole screen: Studio's frame steps aside for it
// (StudioFrame). The first world was set aside at the user's word and is kept on the branch world-v1; this one
// begins as an empty stage and takes its shapes from the user's own picture. Its code: world.ts.
import { WorldView } from './WorldView'

export const metadata = { title: 'World' }

export default function WorldPage() {
  return <WorldView />
}
