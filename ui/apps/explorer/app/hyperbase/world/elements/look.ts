// THE LOOK THE SOLIDS SHARE (21 Nov 2026), written once so that a change to it changes them all.
//
// First the user asked for "transparent glossy and edge illuminating with primary lime light. The edges have to
// be primary." Shown that (clear glass, lit lime edges), they said: "No, I don't like this because even though
// it is glossy, as you said, it looks gray as we see through. So maybe we can ignore about the edges and
// everything and then make just the shape as a glossy [lime] object. I meant glossy lime object."
// So: no see-through, no lit edges. Each solid is a glossy object in the primary colour, lime.
//
// Then, with a picture of a faceted ball: "the sphere also has a little extrusion at the edge, and I like that.
// Let's try that edge [design] for other primitives that we are creating." MY READING: each edge cut flat into
// a narrow strip that catches the light, as in the picture. MY PICK: how wide the cut is.
//
// Then: "Add very small smooth spheres at every vertice." Shown them: "No, the smooth spheres are too weird.
// Let's remove them." So there are none.
import type { CutEdge, Surface } from '../elements.ts'

/** Glossy, in the primary colour: lime. */
export const GLOSSY_LIME: Surface = {
  colour: '--eio-color-action-primary',
  finish: 'glossy',
  says: 'glossy, in the primary colour (lime)',
}

/** Every edge cut flat into a narrow strip. */
export const CUT_EDGE: CutEdge = {
  // halved at the user's word (21 Nov 2026): "Reduce the flatness of the edge by half." It was 0.035.
  width: 0.0175,
  says: 'every edge cut into a narrow strip',
}
