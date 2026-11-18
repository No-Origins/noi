// hyperbase.<base>/space · Space (added 12 Nov by "Spaces As You Picture Them"): your canvas, with
// everything you have made attached to it. It arrives with rung 8. The agreed pages give it no
// address; /space is this mock's choice. How the canvas is drawn is left for later, so what is
// drawn here is a stand-in.
import { space } from '../mock/read'
import { SpaceView } from './SpaceView'

export const metadata = { title: 'Space' }

export default async function SpacePage() {
  return <SpaceView space={await space()} />
}
