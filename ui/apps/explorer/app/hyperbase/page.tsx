// hyperbase.<base>/ · Today (agreed 12 Nov, decision 2): the first screen is what waits for you,
// the oldest first, each with its own buttons. Then what is running now, what finished since you
// last looked and what changed without a person, and the month's money against the caps.
// It arrives with rung 3. A mock: see layout.tsx.
import { month, runningNow, sinceYouLooked, waiting } from './mock/read'
import { Today } from './Today'

export const metadata = { title: 'Today' }

export default async function TodayPage() {
  const [items, running, since, m] = await Promise.all([waiting(), runningNow(), sinceYouLooked(), month()])
  return <Today waiting={items} running={running} since={since} month={m} />
}
