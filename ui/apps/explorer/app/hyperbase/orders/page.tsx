// hyperbase.<base>/orders · standing orders (agreed 12 Nov): what starts each one, its next go,
// its last result, and the date to renew it by. It arrives with rung 4. Agreed 16 Nov: one name
// on the pages, a standing order; each says what starts it.
import { orders } from '../mock/read'
import { Orders } from './Orders'

export const metadata = { title: 'Standing orders' }

export default async function OrdersPage() {
  return <Orders orders={await orders()} />
}
