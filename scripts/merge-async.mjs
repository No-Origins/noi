// Merging a pull request through GitHub's asynchronous merge (PUT …/pulls/{n}/merge-async), the one way
// that merges every pull request: one opened on top of another (a stacked one) can only be merged this
// way. `gh pr merge` was refused for part B's #4 (19 Nov). GitHub merges in the background and is
// asked for the answer by the request's id.

/** What an answer says went wrong, in GitHub's words. */
const words = (answer, reply) =>
  answer?.details?.message ?? answer?.message ?? ((reply?.err || reply?.out || 'no answer').split('\n')[0])

/**
 * Merges pull request `number` with a merge commit, only while its head is `sha`, and waits for it.
 * `api(args)` runs `gh api …args` and gives back { ok, out, err }; `sleep(ms)` waits.
 * Gives back { merged: the merge commit's id, or '' when GitHub did not say } or { error: words }.
 */
export function mergeAsync({ api, sleep, number, sha, tries = 100, every = 3000 }) {
  const path = `repos/{owner}/{repo}/pulls/${number}/merge-async`
  const parse = reply => {
    try { return JSON.parse(reply.out) } catch { return null }
  }
  let reply = api(['-X', 'PUT', path, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-f', `sha=${sha}`])
  let answer = parse(reply)
  for (let asked = 0; ; asked++) {
    const status = answer?.status
    if (status === 'merged') return { merged: answer.details?.sha ?? answer.details?.oid ?? '' }
    if (status === 'enqueued') return { error: 'GitHub put it in a merge queue instead of merging it' }
    if (status !== 'pending' || !answer.details?.uuid) return { error: words(answer, reply) }
    // Pending: this request, or one asked for before and still running (409), which counts only if it
    // merges the same commit.
    const head = answer.details.expected_head_sha
    if (head && head !== sha) return { error: `a merge of it at another commit (${head.slice(0, 7)}) is already asked for` }
    if (asked >= tries) return { error: `GitHub had not merged it after ${Math.round((tries * every) / 1000)} s: see the pull request` }
    sleep(every)
    reply = api([`${path}/${answer.details.uuid}`])
    answer = parse(reply)
  }
}
