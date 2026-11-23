'use client'
// The gallery of the world's elements: every element in ../elements.ts, each with a still picture taken by
// three.js, its name and its size in words. A click on an element opens it over the whole window in a 3D view,
// to be turned round and looked at from every side (ElementView.tsx). The parts are Eidos's: Card, Button, and
// Drawer, which is Eidos's modal.
//
// WHAT GOES ON AN ELEMENT (22 Nov 2026, issue 127). The user: "we can update gallery in such a way that we can
// map things ... right now camera module can only work with drones, so probably we can give options in the
// drone element to select things that can attach to the drone, and then once they select that, then we can
// show a preview of how it looks like when it's attached." So the 3D view of an element that has studs offers
// every element whose sockets fit them (worked out from the data, `fitsOn`: no list is kept by hand), and the
// one chosen is shown set on it. The choice is Eidos's Choices with its Radios.
//
// AN ELEMENT'S OWN CONTROLS (22 Nov 2026, issue 127). The user: "each [element] also have their own set of
// controls that are specific to them. For example, the camera is used to view, so a drone is used to fly around
// and hover on the different states of it. So I think we should also cater for those states and features of an
// element." So an element that has states (its data says them: elements.ts, ElementState) gets a choice of its
// own in its 3D view, "The drone is: Landed, Hovering, Flying", and the view acts the chosen state out. What
// is set on it gets its own choice beside it. Nothing here knows any one element: a new element's states show
// by themselves.
//
// THROUGH THE CAMERA (23 Nov 2026, issue 127). The user: "Also add Camera view, I mean, through the camera." So
// where the element shown, or what is set on it, says one can look out of it (elements.ts, LookOut), the view
// offers to look from outside or through it.
//
// THE VIEWER'S LAYOUT (23 Nov 2026, issue 127). The user, with a picture (a bar on the left, the 3D view large
// on the right): "I think it's better if you arrange the states and options in a card. Use the layout
// inspiration I have provided, and on the left bar, each control set has to be a card. I mean, the controls
// related to drone has to be in the drone card, and similarly organize the settings with our elements from the
// design system." So the viewer has a bar beside the view; in the bar, one Card of Eidos's for each element in
// the view (the one shown, and what is set on it), holding that element's name, what it is, and its own
// controls and nothing of another's. In a window too narrow for two panes the same cards stand above the view.
//
// WHAT IS PLACED ON GROUND (23 Nov 2026, issue 127). The user: "Let's add the base platform as element in the
// gallery too. So that I can select items to place on the platform just like we do in the drone." The base
// platform is an element like the others (elements.ts); `fitsOn` also says what can be placed on ground and
// where, so the same choice, "Set on it", offers it, and what is placed gets its own card and its own states.
//
// COLOURS TO TRY (23 Nov 2026, issue 127). The user, of the stage: "I want to play with colors on the sides,
// border, top face, the glass slab. So in the element of [stage], can you add these controls so that I can just
// play around and see what works and what doesn't work?" So an element may name colours of its own
// (elements.ts, ElementColour), and its card offers each one its chosen state lights with: Eidos's Select
// among Eidos's own colours, with Eidos's Swatch showing the colour chosen. Eidos has no part for choosing any
// colour at all. What is tried lasts while the view is open; nothing is written to the element.
//
// SETTINGS TO CHOOSE (23 Nov 2026, issue 127). The colours above were a misreading. The user: "I did not mean
// selecting different colors, but I meant what controls can we have on the material, the light, and the glass."
// Ten such settings of the stage were offered, tried, and then fixed by the user: "Only controls we need are
// colour, width, breadth and height. The height is only for base. Sizes are steps of 10m." So an element may
// name settings of its own (elements.ts, ElementSetting: today, sizes), in groups, and its card offers each:
// under the group's name, the setting's name and Eidos's Select among its steps. Eidos has no slider. What is
// chosen lasts while the view is open.
// The 3D view holds its place while a long card scrolls past it (gallery.module.css), so what is tried is seen.
//
// THE VIEWER FILLS THE WINDOW (23 Nov 2026). Shown that, the user: "The layout is only taking less width and
// height. Let it take full width and height." It was Eidos's Panes, which stops at the page's width and is
// only as tall as what is in it. So the two columns are laid by this page (gallery.module.css): the bar at the
// left, the 3D view all the rest of the window's width and as tall as the window. Whether the window has room
// for two panes is still Eidos's to say: WhenTwoPanes and WhenOnePane.
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Choices, Drawer, Radio, Select, Swatch, Toggle, WhenOnePane, WhenTwoPanes } from '@noi/eio-react'
import { COLOURS_TO_TRY, ELEMENTS, coloursIn, fitsOn, inWords, sizedBy, type ElementColour, type ElementSetting, type ElementState, type WorldElement } from '../elements'
import { picturesOf } from '../inspect'
import { ElementView } from './ElementView'
import { lengthOf } from '../bend'
import { sideOf, stripOf } from '../rideAlong'
import styles from './gallery.module.css'

const cx = (...names: Array<string | undefined>) => names.filter(Boolean).join(' ')

/** The state an element is shown in: the one chosen, or the one it starts in. Null when it has no states. */
const stateOf = (element: WorldElement | null, id: string | null): ElementState | null =>
  element?.states?.find(s => s.id === id) ?? element?.states?.[0] ?? null

/** An element in the size chosen for it: its settings by their ids and the numbers chosen. The element itself
 * when none is chosen, or when its size cannot be chosen. */
const inSize = (element: WorldElement, chosen: Record<string, number>): WorldElement =>
  sizedBy(element, Object.fromEntries((element.settings ?? []).filter(setting => setting.id in chosen).map(setting => [setting.sets.along, chosen[setting.id]]))) ?? element

/** One element's own control: the states it can be in, and under them what it does in the chosen one. */
function States({ of, chosen, choose, name }: { of: WorldElement; chosen: ElementState; choose(id: string): void; name: string }) {
  return (
    <Choices legend={`The ${of.name.toLowerCase()} is`} across note={chosen.says}>
      {(of.states ?? []).map(state => (
        <Radio key={state.id} name={name} checked={state === chosen} onChange={() => choose(state.id)}>{state.name}</Radio>
      ))}
    </Choices>
  )
}

/** One element's own colours, to try out: for each colour its chosen state lights with, the colour as it is
 * now, its name, and a choice among Eidos's colours. */
function Colours({ of, lit, tried, tryOut }: { of: WorldElement; lit: readonly ElementColour[]; tried: Record<string, string>; tryOut(id: string, colour: string): void }) {
  return (
    <Choices legend="Its colours">
      {lit.map(own => {
        const now = tried[own.id] ?? own.colour
        return (
          <div key={own.id} className={styles.colour} data-colour={own.id}>
            <Swatch color={`var(${now})`} />
            <span className="eio-type-style-body">{own.name}</span>
            <Select wide label={`The colour of the ${of.name.toLowerCase()}'s ${own.name.toLowerCase()}`} value={now} onChange={e => tryOut(own.id, e.target.value)}>
              {COLOURS_TO_TRY.map(offered => <option key={offered.colour} value={offered.colour}>{offered.name}</option>)}
            </Select>
          </div>
        )
      })}
    </Choices>
  )
}

/** One element's own settings, to try out: group by group, each setting's name and a choice among its steps. */
function Settings({ of, offered, tried, tryOut }: { of: WorldElement; offered: readonly ElementSetting[]; tried: Record<string, number>; tryOut(id: string, value: number): void }) {
  const groups = [...new Set(offered.map(setting => setting.group))]
  return (
    <>
      {groups.map(group => (
        <Choices key={group} legend={group} data-settings={group}>
          {offered.filter(setting => setting.group === group).map(setting => (
            <div key={setting.id} className={styles.setting} data-setting={setting.id}>
              <span className="eio-type-style-body">{setting.name}</span>
              <Select wide label={`The ${of.name.toLowerCase()}'s ${group.toLowerCase()}: ${setting.name.toLowerCase()}`} value={String(tried[setting.id] ?? setting.value)} onChange={e => tryOut(setting.id, Number(e.target.value))}>
                {setting.steps.map(step => <option key={step.value} value={String(step.value)}>{step.name}</option>)}
              </Select>
            </div>
          ))}
        </Choices>
      ))}
    </>
  )
}

export function Gallery() {
  const page = useRef<HTMLDivElement>(null)
  const [pictures, setPictures] = useState<Record<string, string>>({})
  // the element in the 3D view stays there while the view leaves, so `open` and `shown` are kept apart
  const [shown, setShown] = useState<WorldElement | null>(null)
  const [open, setOpen] = useState(false)
  // which element is set on the shown one, by its id; none to begin with
  const [onId, setOnId] = useState<string | null>(null)
  // the state the shown element is in, and the state of what is set on it, each by its id; none chosen to
  // begin with, so each starts in its first
  const [stateId, setStateId] = useState<string | null>(null)
  const [onStateId, setOnStateId] = useState<string | null>(null)
  // the colours tried on the shown element, and on what is set on it: each of the element's own colours by its
  // id, and the colour of Eidos it has for now; none tried to begin with
  const [colours, setColours] = useState<Record<string, string>>({})
  const [onColours, setOnColours] = useState<Record<string, string>>({})
  // the settings tried on the shown element, and on what is set on it: each of the element's own settings by
  // its id, and the number it has for now; none tried to begin with
  const [settings, setSettings] = useState<Record<string, number>>({})
  const [onSettings, setOnSettings] = useState<Record<string, number>>({})
  const inspect = (element: WorldElement) => { setShown(element); setOnId(null); setStateId(null); setOnStateId(null); setColours({}); setOnColours({}); setSettings({}); setOnSettings({}); setThroughWhat(null); setOpen(true) }
  const setOn = (id: string | null) => { setOnId(id); setOnStateId(null); setOnColours({}); setOnSettings({}); if (throughWhat === 'on') setThroughWhat(null) }
  // every element that can be set on the shown one: its sockets meet the shown one's studs
  const fits = shown ? ELEMENTS.filter(e => e !== shown && fitsOn(e, shown)) : []
  const on = fits.find(e => e.id === onId) ?? null
  const [state, onState] = [stateOf(shown, stateId), stateOf(on, onStateId)]
  // from where one looks: from outside (none), or through the shown element ('it') or what is set on it ('on'),
  // each offered only when its data says one can look out of it
  const [throughWhat, setThroughWhat] = useState<'it' | 'on' | null>(null)
  // a strip is ridden along by the scroll, seen as the world is (ride.ts; the user, 23 Nov 2026: "as I scroll, the
  // part where we are looking at should always be like what isometric view we are currently looking at in the
  // world"); turned off, it is turned round by the hand as every element is. MY PICK: riding when it opens.
  const [riding, setRiding] = useState(true)
  const [rideY, setRideY] = useState(0)
  const strip = shown?.shape.kind === 'laid' ? shown.shape.bend : undefined
  // a strip of another shape is ridden too, from one end to the other (rideAlong.ts, issue 130)
  const along = shown ? stripOf(shown) : undefined
  const lookOuts = ([['it', shown], ['on', on]] as const).filter(([, element]) => element?.lookOut)
  const through = lookOuts.some(([of]) => of === throughWhat) ? throughWhat : null

  /** One element's card: its name, what it is, and its own controls, none of another's. `of` says which element
   * of the view it is (the one shown, 'it', or what is set on it, 'on'). `where` keeps the two copies of the
   * bar (beside the view, and above it in a narrow window) from sharing one question. */
  const card = (of: 'it' | 'on', element: WorldElement, chosen: ElementState | null, choose: (id: string) => void, where: string) => (
    <Card data-card={element.id}>
      <div className={styles.words}>
        <h2 className="eio-type-style-heading">{element.name}</h2>
        <p className={cx(styles.muted, 'eio-type-style-caption')}>{inWords(inSize(element, of === 'it' ? settings : onSettings))}</p>
      </div>
      {chosen && <States of={element} chosen={chosen} choose={choose} name={`${where}-state-of-${of}`} />}
      {(element.settings ?? []).length > 0 && (
        <Settings of={element} offered={element.settings ?? []} tried={of === 'it' ? settings : onSettings} tryOut={(id, value) => (of === 'it' ? setSettings : setOnSettings)(was => ({ ...was, [id]: value }))} />
      )}
      {coloursIn(element, chosen).length > 0 && (
        <Colours of={element} lit={coloursIn(element, chosen)} tried={of === 'it' ? colours : onColours} tryOut={(id, colour) => (of === 'it' ? setColours : setOnColours)(was => ({ ...was, [id]: colour }))} />
      )}
      {of === 'it' && fits.length > 0 && (
        <Choices legend="Set on it" across>
          <Radio name={`${where}-set-on`} checked={on === null} onChange={() => setOn(null)}>Nothing</Radio>
          {fits.map(piece => (
            <Radio key={piece.id} name={`${where}-set-on`} checked={on === piece} onChange={() => setOn(piece.id)}>{piece.name}</Radio>
          ))}
        </Choices>
      )}
      {element.lookOut && <Toggle checked={through === of} onChange={e => setThroughWhat(e.target.checked ? of : null)}>Look through it</Toggle>}
      {of === 'it' && (strip || along) && <Toggle checked={riding} onChange={e => setRiding(e.target.checked)}>Ride along it</Toggle>}
    </Card>
  )
  /** The bar of the viewer: the way out, a card for each element in the view, and how the hand moves the view. */
  const bar = (where: string) => shown && (
    <div className={styles.bar}>
      <div>
        <Button icon="close" onClick={() => setOpen(false)}>Close</Button>
      </div>
      {card('it', shown, state, setStateId, where)}
      {on && card('on', on, onState, setOnStateId, where)}
      {along && riding ? (
        <>
          {/* a small side view of the whole strip, the dot where the eye is (the user: "a small preview where I'm at") */}
          {(() => {
            const side = sideOf(along)
            const here = side.place(rideY)
            return (
              <Card inset="tight">
                <svg className={styles.side} viewBox={`0 0 ${side.width.toFixed(0)} ${side.height.toFixed(0)}`} role="img" aria-label={`The whole strip seen from the side; the dot is at y ${Math.round(rideY)}`}>
                  <path className={styles.sideLine} d={side.line} />
                  <circle className={styles.sideHere} cx={here.x} cy={here.y} r={side.width / 70} />
                </svg>
              </Card>
            )
          })()}
          <p className={cx(styles.muted, 'eio-type-style-caption')}>
            Scroll to go along the strip, seen as the world is. Looking at x 0, y {Math.round(rideY)} of {along.long}.
          </p>
        </>
      ) : strip && riding ? (
        <p className={cx(styles.muted, 'eio-type-style-caption')}>
          Scroll to go along the strip, seen as the world is. Looking at x 0, y {Math.round(rideY % lengthOf(strip))}{rideY >= lengthOf(strip) ? ', on its other face' : ''}.
        </p>
      ) : (
        <p className={cx(styles.muted, 'eio-type-style-caption')}>
        The {shown.name.toLowerCase()} stands at x 0, y 0. Drag to turn it round, scroll to come near, right-drag to slide.
        </p>
      )}
    </div>
  )

  // the still pictures: taken once, on a canvas that is laid out but not shown
  useEffect(() => {
    const host = page.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = styles.studio ?? ''
    canvas.dataset.theme = 'dark' // the world is seen in Eidos's dark roles, whatever the page's theme
    host.append(canvas)
    const css = getComputedStyle(canvas)
    let left = false
    picturesOf(ELEMENTS, canvas, { background: css.backgroundColor, colour: token => css.getPropertyValue(token).trim() })
      .then(taken => { if (!left) setPictures(taken) })
      .catch((why: unknown) => { console.error(why) })
      .finally(() => canvas.remove())
    return () => { left = true }
  }, [])

  return (
    <div ref={page} className={styles.page}>
      <header className={styles.head}>
        <h1 className="eio-type-style-title">Elements of the world</h1>
        <p className={cx(styles.muted, 'eio-type-style-body')}>
          Every element the 3D world is built from. Click one to turn it round in 3D.
        </p>
      </header>
      <ul className={styles.elements}>
        {ELEMENTS.map(element => (
          <li key={element.id} data-element={element.id}>
            <Card className={styles.element} onClick={() => inspect(element)}>
              <div className={styles.picture} data-theme="dark">
                {pictures[element.id] && <img className={styles.shot} src={pictures[element.id]} alt={`The ${element.name.toLowerCase()}, seen from above and to one side.`} />}
              </div>
              <div className={styles.words}>
                <h2 className="eio-type-style-heading">{element.name}</h2>
                <p className="eio-type-style-body">{element.says}</p>
                <p className={cx(styles.muted, 'eio-type-style-caption')}>{inWords(element)}</p>
              </div>
              <Button icon="eye" onClick={() => inspect(element)}>Inspect in 3D</Button>
            </Card>
          </li>
        ))}
      </ul>
      {/* the viewer is seen in Eidos's dark roles, as the world itself is, whatever the page's theme */}
      <div className={styles.viewer} data-theme="dark">
        <Drawer open={open} onClose={() => setOpen(false)} label={shown ? `${shown.name}, in 3D` : 'An element, in 3D'}>
          {shown && (
            <div className={styles.layout}>
              <WhenTwoPanes><div className={styles.beside}>{bar('beside')}</div></WhenTwoPanes>
              <div className={styles.main}>
                <WhenOnePane>{bar('above')}</WhenOnePane>
                <ElementView element={shown} on={on} state={state?.id ?? null} onState={onState?.id ?? null} through={through} colours={colours} onColours={onColours} settings={settings} onSettings={onSettings} ride={riding} onRide={setRideY} />
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </div>
  )
}
