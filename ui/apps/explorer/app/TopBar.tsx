import type { ReactNode } from 'react'
import { Tab, Tabs, WhenOnePane, WhenTwoPanes } from '@noi/eio-react'
import { Live } from './Live'
import { Menu } from './Menu'
import { ThemeToggle } from './ThemeToggle'
import styles from './topbar.module.css'

// One row. Where two panes sit side by side: the name, the tabs, the live count and Theme. Where one
// pane fills the window: the menu button, the name and the live count; the tabs, this view's `list`
// and Theme are in the menu.
export function TopBar({ view, live, waiting, list }: { view: 'merons' | 'review' | 'eidos' | 'gov'; live?: number; waiting?: number; list?: ReactNode }) {
  const tabs = (
    <Tabs label="Views">
      <Tab href="/merons" selected={view === 'merons'}>Merons</Tab>
      <Tab href="/review" selected={view === 'review'} count={waiting || undefined}>Review</Tab>
      <Tab href="/eidos" selected={view === 'eidos'}>Components</Tab>
      <Tab href="/gov" selected={view === 'gov'}>Governance</Tab>
    </Tabs>
  )
  return (
    <header className={styles.bar}>
      <WhenOnePane>
        <Menu tabs={tabs} list={list} live={live} />
      </WhenOnePane>
      <a className={styles.brand} href="/merons">
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
