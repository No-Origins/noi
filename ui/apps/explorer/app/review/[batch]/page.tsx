// One batch by its uid: /review/<batch>.
import type { Metadata } from 'next'
import { review } from '../../../lib/mero'
import { BatchScreen } from '../BatchScreen'

type Props = { params: Promise<{ batch: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { batch } = await params
  const b = (await review()).batches.find(x => x.uid === batch)
  return { title: b ? `${b.title} · Review` : 'Not found · Review' }
}

export default async function BatchPage({ params }: Props) {
  return <BatchScreen batch={(await params).batch} />
}
