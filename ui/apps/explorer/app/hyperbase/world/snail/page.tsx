// hyperbase.<base>/world/snail · A CONCEPT, NOT THE WORLD (27 Nov 2026): the Super Snail, a hero of a snail whose
// turning shell feeds a booster, travelling along the world's wave platform. The user: "Create an animated concept
// art of a super hero Snail." /world itself is unchanged. Its code: snail.ts (what it is and does), drawSnail.ts
// (how three.js draws it), SnailView.tsx (the page).
import { SnailView } from './SnailView'

export const metadata = { title: 'World · concept: Super Snail' }

export default function SnailPage() {
  return <SnailView />
}
