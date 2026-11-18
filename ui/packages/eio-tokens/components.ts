// Eidos's components and their states, by key, as you approved them in Mero (agreed 18 Nov,
// "Component States"). Mero's writer makes this file (pnpm eio:write) from the merons, and Mero
// checks it is exactly what it writes; nobody edits it. To change a state, change the component's
// meron and approve it in Review.
// A component's code reads each option through a table that names every key, so a key missing
// from the code, or one Mero never approved, fails the type check.

// noi.eio.components.badge
/** active: a meron that is active, as a dot · deprecated: a meron that is deprecated, as a dot · proposed: a meron that is proposed, as a dot */
export type BadgeState = 'active' | 'deprecated' | 'proposed'
/** danger: danger, with its icon · neutral: a plain fact · success: success, with its icon · warning: warning, with its icon */
export type BadgeTone = 'danger' | 'neutral' | 'success' | 'warning'

// noi.eio.components.button
/** disabled: disabled · focus: focused, with the focus ring · hover: hovered */
export type ButtonInteraction = 'disabled' | 'focus' | 'hover'
/** action: a link that does something: its icon, or a picture of who, instead of the arrow · inside: a link to a place in No Origins: still a button, the arrow after its words · outside: a link to a place outside No Origins: words with a dashed underline and the arrow, in a new tab */
export type ButtonLink = 'action' | 'inside' | 'outside'
/** default: 40 px · large: 48 px, for a screen’s single big action */
export type ButtonSize = 'default' | 'large'
/** plain: for the rest · primary: for the one main action · secondary: for the other strong one */
export type ButtonVariant = 'plain' | 'primary' | 'secondary'
/** content: as wide as its words · wide: as wide as its container */
export type ButtonWidth = 'content' | 'wide'

// noi.eio.components.card
/** default: the card’s inset · tight: the tighter inset of a control, for small cards */
export type CardInset = 'default' | 'tight'

// noi.eio.components.checkbox
/** list: in a list, with its words · tile: a tile with what it does, tinted while on */
export type CheckboxForm = 'list' | 'tile'
/** checked: on: lime with a tick · disabled: locked · focus: focused, with the focus ring */
export type CheckboxInteraction = 'checked' | 'disabled' | 'focus'

// noi.eio.components.chip
/** focus: focused, with the focus ring · hover: hovered */
export type ChipInteraction = 'focus' | 'hover'
/** inside: a thing in No Origins: it opens here · outside: another site: the arrow after its name, opening in a new tab */
export type ChipLink = 'inside' | 'outside'

// noi.eio.components.choice
/** checked: on: lime, with its tick or dot · disabled: locked · focus: focused, with the focus ring */
export type ChoiceInteraction = 'checked' | 'disabled' | 'focus'

// noi.eio.components.choices
/** across: across, in a row that wraps · down: one under another */
export type ChoicesLayout = 'across' | 'down'

// noi.eio.components.disclosure
/** focus: focused, with the focus ring · hover: hovered · open: open, its arrow turned */
export type DisclosureInteraction = 'focus' | 'hover' | 'open'

// noi.eio.components.drawer
/** fade: fades in and out · grow: grows out of the button that opened it, and shrinks back into it */
export type DrawerArrival = 'fade' | 'grow'
/** arriving: arriving, in 300 ms (at once with reduced motion) · leaving: leaving, in 200 ms (at once with reduced motion) */
export type DrawerInteraction = 'arriving' | 'leaving'

// noi.eio.components.field
/** focus: focused: the whole frame shows the focus ring */
export type FieldInteraction = 'focus'

// noi.eio.components.icon
/** agent: an agent · arrow: an arrow to the right: go on · check: a tick in a circle: success · close: a cross: close · comp: a pill: a component · dash: a line in a circle: not yet, or does not apply · doc: a page: a document or an invariant · down: pointing down: an open row, a list that opens · drop: a drop: a colour · eye: an eye: look, or show · fingerprint: a fingerprint: your touch · fit: four corners: fit to the window · key: a key: a passkey · layers: stacked layers: a system or a group · left: pointing left: back · menu: three lines: the menu · minus: a minus: take away · pen: a pen: change · plus: a plus: add · right: pointing right: on, or open a row · search: a magnifying glass: search · theme: a half-filled circle: light or dark · tick: a tick: a checkbox that is on · up-right: up and to the right, at 45 degrees: a link to a place · user: a person · warn: a triangle with a mark: warning · x: a cross in a circle: danger, or no */
export type IconName = 'agent' | 'arrow' | 'check' | 'close' | 'comp' | 'dash' | 'doc' | 'down' | 'drop' | 'eye' | 'fingerprint' | 'fit' | 'key' | 'layers' | 'left' | 'menu' | 'minus' | 'pen' | 'plus' | 'right' | 'search' | 'theme' | 'tick' | 'up-right' | 'user' | 'warn' | 'x'
/** default: 20 px · large: 24 px · small: 16 px */
export type IconSize = 'default' | 'large' | 'small'

// noi.eio.components.menu-icon
/** open: a cross: the outer lines turned to meet, the middle one gone · shut: three lines */
export type MenuIconState = 'open' | 'shut'

// noi.eio.components.panes
/** one: one pane: the page fills the window · two: two panes side by side, the list a third of the width */
export type PanesWindow = 'one' | 'two'

// noi.eio.components.radio
/** checked: chosen: a lime circle with a dark dot · disabled: locked · focus: focused, with the focus ring */
export type RadioInteraction = 'checked' | 'disabled' | 'focus'

// noi.eio.components.select
/** disabled: disabled · focus: focused, with the focus ring */
export type SelectInteraction = 'disabled' | 'focus'
/** content: as wide as its words · wide: as wide as its container */
export type SelectWidth = 'content' | 'wide'

// noi.eio.components.sidebar
/** groups: the rows in named groups, each under its name · one: the rows in one list */
export type SidebarList = 'groups' | 'one'

// noi.eio.components.swatch
/** default: 24 px · large: 40 px · small: 16 px */
export type SwatchSize = 'default' | 'large' | 'small'

// noi.eio.components.tabs
/** focus: focused, with the focus ring · hover: hovered */
export type TabsInteraction = 'focus' | 'hover'
/** other: another view · selected: the view on screen now, filled with the primary action colour */
export type TabsState = 'other' | 'selected'

// noi.eio.components.text-area
/** disabled: disabled · focus: focused, with the focus ring */
export type TextAreaInteraction = 'disabled' | 'focus'
/** body: body words · mono: mono words, for Cedar and JSON */
export type TextAreaWords = 'body' | 'mono'

// noi.eio.components.tree-row
/** closed: holds others, closed: its arrow points right · leaf: a leaf: holds nothing · open: holds others, open: its arrow points down */
export type TreeRowHolds = 'closed' | 'leaf' | 'open'
/** focus: focused, with the focus ring · hover: hovered */
export type TreeRowInteraction = 'focus' | 'hover'
/** other: not chosen · selected: chosen */
export type TreeRowState = 'other' | 'selected'

// noi.eio.components.world.arch
/** distance: how far its back stands from the pool’s middle · height: how tall · reach: how far its top reaches toward the pool · thickness: how thick its posts and beam are · width: how wide */
export type ArchMeasure = 'distance' | 'height' | 'reach' | 'thickness' | 'width'

// noi.eio.components.world.character-drawing
/** catchUp: Eye catch-up time · ceiling: Flight ceiling · chase: Eye in fast flight · dark: Going dark · eyeGateway: Eye in a gateway · eyeJump: Eye in the jump · fly: Fly · height: Character height · hover: Hover height · jump: Jump height · jumpHeight: Flight jump height · jumpTime: Flight jump time · leastIn: Least time in a gateway · onFoot: Eye on foot · rise: Rise and sink · run: Run · stepUp: Highest step without a jump · topSpeed: Flight top speed · walk: Walk */
export type CharacterDrawingMeasure = 'catchUp' | 'ceiling' | 'chase' | 'dark' | 'eyeGateway' | 'eyeJump' | 'fly' | 'height' | 'hover' | 'jump' | 'jumpHeight' | 'jumpTime' | 'leastIn' | 'onFoot' | 'rise' | 'run' | 'stepUp' | 'topSpeed' | 'walk'
/** run: running · stand: standing plainly, arms down · walk: walking */
export type CharacterDrawingMotion = 'run' | 'stand' | 'walk'

// noi.eio.components.world.clay
/** running: running · walking: walking */
export type ClayClips = 'running' | 'walking'

// noi.eio.components.world.fairy-bot
/** running: running · walking: walking */
export type FairyBotClips = 'running' | 'walking'

// noi.eio.components.world.gateway
/** ahead: how far ahead they run · behind: how far behind the character ripples start · depth: how deep the gateway goes · gap: the time between lime ripples · speed: how fast a ripple runs · tail: a ripple’s tail */
export type GatewayMeasure = 'ahead' | 'behind' | 'depth' | 'gap' | 'speed' | 'tail'

// noi.eio.components.world.land
/** band: how far past the edge nothing is left · circle-radius: a circle’s radius · dash: a dash of a circle’s line · grain: one grain of the dust · line: a circle’s line · place: the place each circle has · radius: the land’s radius */
export type LandMeasure = 'band' | 'circle-radius' | 'dash' | 'grain' | 'line' | 'place' | 'radius'

// noi.eio.components.world.mannequin
/** running: running · walking: walking */
export type MannequinClips = 'running' | 'walking'

// noi.eio.components.world.pool
/** pool-radius: the pool’s radius · wall-height: the wall’s height · wall-width: the wall’s width */
export type PoolMeasure = 'pool-radius' | 'wall-height' | 'wall-width'

// noi.eio.components.world.stage
/** drag: turned: dragged, scrolled or pinched closer · focus: focused, with the focus ring */
export type StageInteraction = 'drag' | 'focus'

// noi.eio.components.world.steps
/** depth: a step’s depth · height: a step’s height · start: where the steps begin · top: the top step’s height */
export type StepsMeasure = 'depth' | 'height' | 'start' | 'top'

/** Every component's states by key: each group and its keys. */
export const states = {
  'noi.eio.components.badge': {
    state: ['active', 'deprecated', 'proposed'],
    tone: ['danger', 'neutral', 'success', 'warning'],
  },
  'noi.eio.components.button': {
    interaction: ['disabled', 'focus', 'hover'],
    link: ['action', 'inside', 'outside'],
    size: ['default', 'large'],
    variant: ['plain', 'primary', 'secondary'],
    width: ['content', 'wide'],
  },
  'noi.eio.components.card': {
    inset: ['default', 'tight'],
  },
  'noi.eio.components.checkbox': {
    form: ['list', 'tile'],
    interaction: ['checked', 'disabled', 'focus'],
  },
  'noi.eio.components.chip': {
    interaction: ['focus', 'hover'],
    link: ['inside', 'outside'],
  },
  'noi.eio.components.choice': {
    interaction: ['checked', 'disabled', 'focus'],
  },
  'noi.eio.components.choices': {
    layout: ['across', 'down'],
  },
  'noi.eio.components.disclosure': {
    interaction: ['focus', 'hover', 'open'],
  },
  'noi.eio.components.drawer': {
    arrival: ['fade', 'grow'],
    interaction: ['arriving', 'leaving'],
  },
  'noi.eio.components.field': {
    interaction: ['focus'],
  },
  'noi.eio.components.icon': {
    name: ['agent', 'arrow', 'check', 'close', 'comp', 'dash', 'doc', 'down', 'drop', 'eye', 'fingerprint', 'fit', 'key', 'layers', 'left', 'menu', 'minus', 'pen', 'plus', 'right', 'search', 'theme', 'tick', 'up-right', 'user', 'warn', 'x'],
    size: ['default', 'large', 'small'],
  },
  'noi.eio.components.menu-icon': {
    state: ['open', 'shut'],
  },
  'noi.eio.components.panes': {
    window: ['one', 'two'],
  },
  'noi.eio.components.radio': {
    interaction: ['checked', 'disabled', 'focus'],
  },
  'noi.eio.components.select': {
    interaction: ['disabled', 'focus'],
    width: ['content', 'wide'],
  },
  'noi.eio.components.sidebar': {
    list: ['groups', 'one'],
  },
  'noi.eio.components.swatch': {
    size: ['default', 'large', 'small'],
  },
  'noi.eio.components.tabs': {
    interaction: ['focus', 'hover'],
    state: ['other', 'selected'],
  },
  'noi.eio.components.text-area': {
    interaction: ['disabled', 'focus'],
    words: ['body', 'mono'],
  },
  'noi.eio.components.tree-row': {
    holds: ['closed', 'leaf', 'open'],
    interaction: ['focus', 'hover'],
    state: ['other', 'selected'],
  },
  'noi.eio.components.world.arch': {
    measure: ['distance', 'height', 'reach', 'thickness', 'width'],
  },
  'noi.eio.components.world.character-drawing': {
    measure: ['catchUp', 'ceiling', 'chase', 'dark', 'eyeGateway', 'eyeJump', 'fly', 'height', 'hover', 'jump', 'jumpHeight', 'jumpTime', 'leastIn', 'onFoot', 'rise', 'run', 'stepUp', 'topSpeed', 'walk'],
    motion: ['run', 'stand', 'walk'],
  },
  'noi.eio.components.world.clay': {
    clips: ['running', 'walking'],
  },
  'noi.eio.components.world.fairy-bot': {
    clips: ['running', 'walking'],
  },
  'noi.eio.components.world.gateway': {
    measure: ['ahead', 'behind', 'depth', 'gap', 'speed', 'tail'],
  },
  'noi.eio.components.world.land': {
    measure: ['band', 'circle-radius', 'dash', 'grain', 'line', 'place', 'radius'],
  },
  'noi.eio.components.world.mannequin': {
    clips: ['running', 'walking'],
  },
  'noi.eio.components.world.pool': {
    measure: ['pool-radius', 'wall-height', 'wall-width'],
  },
  'noi.eio.components.world.stage': {
    interaction: ['drag', 'focus'],
  },
  'noi.eio.components.world.steps': {
    measure: ['depth', 'height', 'start', 'top'],
  },
} as const
