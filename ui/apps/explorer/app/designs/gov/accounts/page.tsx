import { Panes } from '@noi/eio-react'
import { DesignBar } from '../../DesignBar'
import { AccountList, AgentPage } from './parts'

// gov.no-origins.com/accounts/claude-code: everyone who can act in NOI, and one of them.
export default function Accounts() {
  return (
    <>
      <DesignBar system="gov" view="Accounts" />
      <Panes list={<AccountList />}>
        <AgentPage />
      </Panes>
    </>
  )
}
