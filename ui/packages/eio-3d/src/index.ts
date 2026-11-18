// @noi/eio-3d: Eidos's 3D elements for No Origins, drawn on the graphics card. Its numbers and colours
// come from Eidos (Mero, or @noi/eio-tokens); the drawing code was moved from the 3D world page.
export { archMeasure, archPlaces, archShape, blockShape, ARCH_MEASURES, type ArchMeasure, type ArchValues } from './arch/arch.ts'
export { circlesInRow, firstRow, landMeasure, landValue, LAND_MEASURES, type LandMeasure, type LandValues } from './land/land.ts'
export { poolMeasure, poolValue, POOL_MEASURES, wallShape, type PoolMeasure, type WallValues } from './pool/pool.ts'
export { stepCount, stepsList, stepsMeasure, stepsShape, stepsValue, STEPS_MEASURES, type StepsMeasure, type StepsValues } from './steps/steps.ts'
export { gatewayShape, GATEWAY_MEASURES, GATEWAY_UNITS, inGateway, opening, rippleFronts, rippleSpacing, type GatewayMeasure, type GatewayValues, type RippleValues } from './gateway/gateway.ts'
export { CharacterPainter, characterFiles, type CharacterFiles, type Motion } from './character-drawing/characters.ts'
export { characterLine, CHARACTER_MEASURES, motionFor, type CharacterMeasure, type CharacterValues } from './character-drawing/character-measures.ts'
export { Stage, type ArchScene, type CharacterScene, type GatewayScene, type EdgeValues, type Label, type LandColours, type LandScene, type Mark, type Overlay, type PoolColours, type PoolScene, type Scene, type StageColours, type StepsColours, type StepsScene } from './stage/stage.ts'
export { Stage3D, type Stage3DProps } from './stage/Stage3D.tsx'
