// Shown instead of a page whose server is not on the internet yet (20 Nov): the app is hosted, Mero
// or Governance still runs only on the maintainer's Mac. Plain words and no "try again", since trying
// again changes nothing until the server is hosted. The top bar stays, for the pages that work.
import { notHostedWords, type Server } from '../lib/backend'

export function NotHostedYet({ server, doing }: { server: Server; doing?: string }) {
  const { title, line } = notHostedWords(server, doing)
  return (
    <main className="noi-error">
      <p className="noi-error-muted eio-type-style-label">{server}</p>
      <h1 className="eio-type-style-title">{title}</h1>
      <p className="eio-type-style-body">{line}</p>
    </main>
  )
}
