// /review/gov/<id> (step 3): one change to roles and rules, in the one Review, decided by Governance.
import { GovProposalScreen } from '../../GovProposalScreen'

export const metadata = { title: 'Review · Explorer' }

export default async function GovProposalPage({ params }: { params: Promise<{ id: string }> }) {
  return <GovProposalScreen id={(await params).id} />
}
