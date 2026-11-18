'use client'
// Governance's own list (9 Nov), on Eidos's Sidebar as Merons and Review are (17 Nov): its home,
// your account and profile, the roles, and the owners' pages. Each row is a link on its page's own
// name, so the list works from a profile on the base name too; the page on screen is marked.
import { usePathname } from 'next/navigation'
import { Icon, Sidebar, TreeRow, type IconName } from '@noi/eio-react'
import type { Name } from '../../lib/hosts'

interface Row { name: string; icon: IconName; href: string; /** Its path on Governance's own name, for a page of Governance. */ path?: string }

export function GovNav({ at, owner, handle }: { at: Record<Name, string>; owner: boolean; handle?: string }) {
  // On Governance's own name the folder is not in the address; under another name it is.
  const here = (usePathname() ?? '/').replace(/^\/gov(?=\/|$)/, '') || '/'
  const rows: Row[] = [
    { name: 'Dashboard', icon: 'layers', href: `${at.gov}/`, path: '/' },
    ...(handle ? [
      { name: 'Your account', icon: 'key', href: `${at.gov}/account`, path: '/account' },
      { name: 'Your profile', icon: 'eye', href: `${at.base}/@${handle}` },
      { name: 'Roles', icon: 'check', href: `${at.gov}/roles`, path: '/roles' },
    ] satisfies Row[] : []),
    ...(owner ? [
      { name: 'Accounts', icon: 'user', href: `${at.gov}/accounts`, path: '/accounts' },
      { name: 'The record', icon: 'doc', href: `${at.gov}/record`, path: '/record' },
      { name: 'Problems', icon: 'warn', href: `${at.gov}/problems`, path: '/problems' },
      { name: 'New role', icon: 'plus', href: `${at.mero}/merons/noi/gov/roles?new` },
    ] satisfies Row[] : []),
  ]
  const on = (path?: string) => path !== undefined && (path === '/' ? here === '/' : here === path || here.startsWith(path + '/'))
  return (
    <Sidebar label="Governance">
      {rows.map(r => <TreeRow key={r.name} name={r.name} preview={<Icon name={r.icon} />} href={r.href} selected={on(r.path)} />)}
    </Sidebar>
  )
}
