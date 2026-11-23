// hyperbase.<base>/world/try-coordinates · A TRY, NOT THE PLATFORM (21 Nov 2026, issue 117 in noi-planning):
// the square land the user decided on, with four ways of seeing its coordinates to choose from. /world stays
// empty until the user decides. Its code: coordinates.ts.
import { TryView } from './TryView'

export const metadata = { title: 'World · try: coordinates' }

export default function TryCoordinatesPage() {
  return <TryView />
}
