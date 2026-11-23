// gov.no-origins.localhost:3000/rules/<name>/change (step 3): a change to a rule, proposed here and
// approved in Review.
import { ChangePage } from '../../../roles/ChangePage'

export const metadata = { title: 'Change a rule · Governance' }

export default async function ChangeRule({ params }: { params: Promise<{ id: string }> }) {
  return <ChangePage path={`noi.gov.rules.${decodeURIComponent((await params).id)}`} />
}
