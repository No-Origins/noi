// hyperbase.<base>/world/gallery · THE GALLERY OF THE WORLD'S ELEMENTS (21 Nov 2026, issue 123 in noi-planning).
// The user: "Every element should have a gallery, and when I click the element, show the element in a [modal]
// in 3D view so that I can inspect the element." Every element in ../elements.ts is here; the first is the base
// tile. Its code: Gallery.tsx.
import { Gallery } from './Gallery'

export const metadata = { title: 'World · elements' }

export default function GalleryPage() {
  return <Gallery />
}
