'use client'
// Every Eidos component, in light and dark, built from the real packages. Used to check the components.
import { type ReactNode, useState } from 'react'
import {
  Badge, Button, Card, Checkbox, Choices, Count, Disclosure, Field, Icon, type IconName, MenuIcon, Radio, Select, Sidebar, Swatch, Tab,
  Tabs, TextArea, Toggle, TreeRow,
} from '@noi/eio-react'
import { tokens } from '@noi/eio-tokens'
import styles from './gallery.module.css'

const ICONS: IconName[] = ['search', 'check', 'tick', 'x', 'warn', 'plus', 'arrow', 'close', 'layers', 'doc', 'pen', 'user', 'agent', 'theme', 'comp', 'drop', 'key', 'fingerprint', 'eye', 'fit']

function Part({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className={styles.part}>
      <h2 className={[styles.partName, 'eio-type-style-label'].join(' ')}>{name}</h2>
      <div className={styles.parts}>{children}</div>
    </section>
  )
}

function Gallery({ theme }: { theme: 'light' | 'dark' }) {
  const [query, setQuery] = useState(theme === 'light' ? '' : 'lime')
  const [selected, setSelected] = useState('danger')
  const [cross, setCross] = useState(false)
  const [touch, setTouch] = useState(true)
  const [owner, setOwner] = useState(false)
  const [verbs, setVerbs] = useState(['propose'])
  const [markers, setMarkers] = useState(false)
  const [numbers, setNumbers] = useState(true)
  const [who, setWho] = useState('role')
  const [role, setRole] = useState('maintainer')
  const [impact, setImpact] = useState('non-breaking')
  const [find, setFind] = useState('')
  const [open, setOpen] = useState(true)
  const [meron, setMeron] = useState('color')
  const [page, setPage] = useState('roles')
  const flip = (v: string, on: boolean) => setVerbs(vs => (on ? [...vs, v] : vs.filter(x => x !== v)))
  const danger = tokens.color.text.danger
  return (
    <div className={styles.theme} data-theme={theme}>
      <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>{theme} · @noi/eio-react</p>
      <Part name="Button">
        <div className={styles.row}>
          <Button variant="primary" icon="check">Approve</Button>
          <Button variant="secondary" icon="arrow">Send back</Button>
          <Button>Reject</Button>
          <Button disabled>Off</Button>
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="large" icon="key">Sign in with passkey</Button>
        </div>
      </Part>
      <Part name="Field">
        <Field label="Search" icon="search" hint="/" placeholder="Search names, paths, values" value={query} onChange={e => setQuery(e.target.value)} onClear={() => setQuery('')} />
      </Part>
      <Part name="Checkbox">
        <div className={styles.row}>
          <Checkbox checked={touch} onChange={e => setTouch(e.target.checked)}>They touched just now</Checkbox>
          <Checkbox checked={owner} onChange={e => setOwner(e.target.checked)}>They hold Owner</Checkbox>
          <Checkbox checked disabled readOnly>Included</Checkbox>
        </div>
        <div className={styles.tiles}>
          <Checkbox tile detail="Suggest changes" checked={verbs.includes('propose')} onChange={e => flip('propose', e.target.checked)}>propose</Checkbox>
          <Checkbox tile detail="Approve or send back" checked={verbs.includes('review')} onChange={e => flip('review', e.target.checked)}>review</Checkbox>
          <Checkbox tile detail="Read" checked disabled readOnly>view</Checkbox>
        </div>
      </Part>
      <Part name="Toggle">
        <div className={styles.row}>
          <Toggle checked={markers} onChange={e => setMarkers(e.target.checked)}>Markers</Toggle>
          <Toggle checked={numbers} onChange={e => setNumbers(e.target.checked)}>Numbers</Toggle>
          <Toggle checked disabled readOnly>Passkeys</Toggle>
        </div>
      </Part>
      <Part name="Radio and Choices">
        <Choices legend="Who" across>
          <Radio name={`who-${theme}`} checked={who === 'anyone'} onChange={() => setWho('anyone')}>Anyone</Radio>
          <Radio name={`who-${theme}`} checked={who === 'role'} onChange={() => setWho('role')}>Holders of a role</Radio>
          {who === 'role' && (
            <Select label="Role" value={role} onChange={e => setRole(e.target.value)}>
              <option value="maintainer">Maintainer</option>
              <option value="owner">Owner</option>
              <option value="proposer">Proposer</option>
            </Select>
          )}
        </Choices>
        <Choices legend="What it does to what reads it" note="A breaking change needs a plan.">
          <Radio name={`impact-${theme}`} checked={impact === 'non-breaking'} onChange={() => setImpact('non-breaking')}>Nothing that reads it should break</Radio>
          <Radio name={`impact-${theme}`} checked={impact === 'breaking'} onChange={() => setImpact('breaking')}>Something may break</Radio>
          <Radio name={`impact-${theme}`} disabled>Locked</Radio>
        </Choices>
      </Part>
      <Part name="Select">
        <div className={styles.row}>
          <Select label="Role" defaultValue="maintainer">
            <option value="maintainer">Maintainer</option>
            <option value="owner">Owner</option>
          </Select>
          <Select label="Locked" disabled>
            <option>Locked</option>
          </Select>
        </div>
        <Select label="Account" wide defaultValue="hiddenstack">
          <option>hiddenstack</option>
          <option>claude-code</option>
        </Select>
      </Part>
      <Part name="Text area">
        {/* As the forms use it: inside a label with its words, which are part of its target. */}
        <label className={styles.labelled}>
          <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>Definition</span>
          <TextArea rows={2} defaultValue="Reading Mero and proposing changes, which wait in Review." />
        </label>
        <label className={styles.labelled}>
          <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>Responsibility, one line</span>
          <TextArea rows={1} placeholder="Suggest changes; never decide them." />
        </label>
        <label className={styles.labelled}>
          <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>Cedar</span>
          <TextArea mono rows={2} defaultValue={'permit (principal, action, resource)\nwhen { principal in Role::"owner" };'} />
        </label>
      </Part>
      <Part name="Disclosure">
        <Disclosure summary="The Cedar it writes">
          <pre className={[styles.code, 'eio-type-style-mono'].join(' ')}>forbid (principal, action, resource);</pre>
        </Disclosure>
        <Disclosure summary="Spec and metadata as stored" open>
          <pre className={[styles.code, 'eio-type-style-mono'].join(' ')}>{'{ "spec": { "px": 4 } }'}</pre>
        </Disclosure>
      </Part>
      <Part name="Badge">
        <div className={styles.row}>
          <Badge state="active">Active</Badge>
          <Badge state="proposed">Proposed</Badge>
          <Badge state="deprecated">Deprecated</Badge>
          <Badge>Rev 4</Badge>
        </div>
        <div className={styles.row}>
          <Badge tone="danger">1 fails</Badge>
          <Badge tone="warning">Breaking</Badge>
          <Badge tone="success">All pass</Badge>
          <Count value={10} label="waiting" />
        </div>
      </Part>
      <Part name="Tabs">
        <Tabs label="Views">
          <Tab href="#entities" selected>Entities</Tab>
          <Tab href="#map">Map</Tab>
          <Tab href="#review" count={10}>Review</Tab>
        </Tabs>
      </Part>
      <Part name="Card">
        <div className={styles.row}>
          <Card>
            <span className="eio-type-style-heading">Color</span>
            <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>17 palette colors · 19 roles</span>
          </Card>
          <Card inset="tight">
            <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>Line</span>
            <span className="eio-type-style-heading">28 px</span>
          </Card>
        </div>
      </Part>
      <Part name="Menu icon">
        <div className={styles.row}>
          <Button aria-label={cross ? 'Show the menu icon' : 'Show the close icon'} onClick={() => setCross(c => !c)}>
            <MenuIcon open={cross} />
          </Button>
          <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>☰ turns into ✕ and back. Press it.</span>
        </div>
      </Part>
      <Part name="Tree row">
        <div role="tree" aria-label="Eidos" className={styles.tree}>
          <TreeRow name="Eidos" open preview={<Icon name="layers" />} count={98} selected={selected === 'eidos'} onSelect={() => setSelected('eidos')} />
          <TreeRow name="Palette" depth={1} open={false} count={17} selected={selected === 'palette'} onSelect={() => setSelected('palette')} />
          <TreeRow name="Danger text" depth={1} preview={<Swatch light={danger.light} dark={danger.dark} />} selected={selected === 'danger'} onSelect={() => setSelected('danger')} />
        </div>
      </Part>
      <Part name="Sidebar">
        {/* As Merons uses it: a search on top, then one tree whose rows open and close. */}
        <div className={styles.tree}>
          <Sidebar
            label="Merons"
            top={<Field label="Search merons" icon="search" hint="/" placeholder="Search names, paths, colors" value={find} onChange={e => setFind(e.target.value)} onClear={() => setFind('')} />}
            empty={find ? <>Nothing matches “{find}”.</> : undefined}
          >
            {!find && <TreeRow name="Eidos · Design System" open={open} onToggle={() => setOpen(o => !o)} preview={<Icon name="layers" />} count={164} selected={meron === 'eidos'} onSelect={() => setMeron('eidos')} />}
            {!find && open && <TreeRow name="Color" depth={1} open={false} preview={<Icon name="layers" />} count={48} selected={meron === 'color'} onSelect={() => setMeron('color')} />}
            {!find && open && <TreeRow name="Layout" depth={1} open={false} preview={<Icon name="layers" />} count={3} selected={meron === 'layout'} onSelect={() => setMeron('layout')} />}
            {!find && <TreeRow name="Governance" open={false} preview={<Icon name="layers" />} count={9} selected={meron === 'gov'} onSelect={() => setMeron('gov')} />}
          </Sidebar>
        </div>
        {/* As Governance and Review use it: pages or batches by name, in groups. */}
        <div className={styles.tree}>
          <Sidebar
            label="Governance"
            groups={[
              {
                name: 'Yours',
                rows: (
                  <>
                    <TreeRow name="Your account" preview={<Icon name="key" />} selected={page === 'account'} onSelect={() => setPage('account')} />
                    <TreeRow name="Roles" preview={<Icon name="check" />} selected={page === 'roles'} onSelect={() => setPage('roles')} />
                  </>
                ),
              },
              {
                name: 'For owners',
                rows: (
                  <>
                    <TreeRow name="Accounts" preview={<Icon name="user" />} count={3} selected={page === 'accounts'} onSelect={() => setPage('accounts')} />
                    <TreeRow name="Problems" preview={<Icon name="warn" />} selected={page === 'problems'} onSelect={() => setPage('problems')} />
                  </>
                ),
              },
            ]}
          />
        </div>
      </Part>
      <Part name="Swatch">
        <div className={styles.row}>
          <Swatch color={tokens.color.palette.lime} size="small" />
          <Swatch color={tokens.color.palette.violet} />
          <Swatch color={tokens.color.text.success[theme]} size="large" />
          <Swatch light={tokens.color.text.primary.light} dark={tokens.color.text.primary.dark} size="large" label="Primary text, light and dark" />
        </div>
      </Part>
      <Part name="Icon">
        <div className={styles.row}>
          {ICONS.map(name => <Icon key={name} name={name} />)}
        </div>
      </Part>
    </div>
  )
}

export default function EidosGallery() {
  return (
    <main className={styles.page}>
      <Gallery theme="light" />
      <Gallery theme="dark" />
    </main>
  )
}
