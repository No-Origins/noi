import type { ReactNode } from 'react'
import { Tab, Tabs, WhenOnePane, WhenTwoPanes } from '@noi/eio-react'
import { TabCount } from './hyperbase/TabCount'
import { waiting as waitingInStudio } from './hyperbase/mock/read'
import { Live } from './Live'
import { Menu } from './Menu'
import { ThemeToggle } from './ThemeToggle'
import { origins } from '../lib/where'
import styles from './topbar.module.css'

// One row. Where two panes sit side by side: the name, the tabs, the live count and Theme. Where one
// pane fills the window: the menu button, the name and the live count; the tabs, this view's `list`
// and Theme are in the menu. Each tab goes to its system's own name (agreed 8 Nov). The Hyperbase
// tab shows how many things wait for you, on every page of the app (agreed 12 Nov); while Studio is
// a mock (15 Nov) that count is made up, from app/hyperbase/mock.
export async function TopBar({ view, live, waiting, list }: { view: 'merons' | 'review' | 'eidos' | 'gov' | 'hyperbase'; live?: number; waiting?: number; list?: ReactNode }) {
  const [at, inStudio] = await Promise.all([origins(), waitingInStudio()])
  const tabs = (
    <Tabs label="Views">
      <Tab href={`${at.mero}/merons`} selected={view === 'merons'}>Merons</Tab>
      <Tab href={`${at.mero}/review`} selected={view === 'review'} count={waiting || undefined}>Review</Tab>
      <Tab href={`${at.eidos}/`} selected={view === 'eidos'}>Components</Tab>
      <Tab href={`${at.gov}/`} selected={view === 'gov'}>Governance</Tab>
      <Tab href={`${at.hyperbase}/`} selected={view === 'hyperbase'}>Hyperbase<TabCount items={inStudio} /></Tab>
    </Tabs>
  )
  return (
    <header className={styles.bar}>
      <WhenOnePane>
        <Menu tabs={tabs} list={list} live={live} />
      </WhenOnePane>
      <a className={styles.brand} href={`${at.mero}/merons`}>
        <span className={[styles.brandLabel, 'eio-type-style-label'].join(' ')}>NOI</span>
        <span className="eio-type-style-heading">Explorer</span>
      </a>
      <WhenTwoPanes>
        <div className={styles.tabsInline}>{tabs}</div>
      </WhenTwoPanes>
      <div className={styles.end}>
        {live !== undefined && <Live count={live} />}
        <WhenTwoPanes>
          <ThemeToggle />
        </WhenTwoPanes>
      </div>
    </header>
  )
}
