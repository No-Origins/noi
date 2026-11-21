// gov.no-origins.localhost:3000/roles/<name>/change (step 3): a change to a role, proposed here and
// approved in Review.
import { ChangePage } from '../../ChangePage'

export const metadata = { title: 'Change a role · Governance' }

export default async function ChangeRole({ params }: { params: Promise<{ id: string }> }) {
  return <ChangePage path={`noi.gov.roles.${decodeURIComponent((await params).id)}`} />
}
