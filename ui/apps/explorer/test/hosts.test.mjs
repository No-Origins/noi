// The front desk (agreed 8 Nov): each system on its own name under the base name, plain localhost
// sent on, one address for each page, and sign-in sending you back only to our own names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backTo, baseName, frontDesk, mailInbox, NAMES, originOf, owner, splitHost, systemOf } from '../lib/hosts.ts'
import { insideNoOrigins } from '../../../packages/eio-react/src/links/links.ts'

const D = 'no-origins.localhost'
const desk = (host, path) => frontDesk(host, path, D)

test('a name belongs to its system, under the base name only', () => {
  assert.equal(systemOf('gov.no-origins.localhost', D), 'gov')
  assert.equal(systemOf('mero.no-origins.localhost', D), 'mero')
  assert.equal(systemOf('eidos.no-origins.localhost', D), 'eidos')
  assert.equal(systemOf('no-origins.localhost', D), 'base')
  assert.equal(systemOf('hyperbase.no-origins.localhost', D), 'hyperbase', 'the fourth name (15 Nov)')
  assert.equal(systemOf('hyp.no-origins.localhost', D), undefined, 'only the whole name')
  assert.equal(systemOf('gov.no-origins.localhost.example', D), undefined)
  assert.equal(systemOf('evilno-origins.localhost', D), undefined)
  assert.equal(systemOf('gov.no-origins.com', 'no-origins.com'), 'gov', 'hosted, the same with another base')
})

test('each page of the app has an owner and a place on its name', () => {
  assert.deepEqual(owner('/gov/account/sign-in'), { system: 'gov', path: '/account/sign-in' })
  assert.deepEqual(owner('/gov'), { system: 'gov', path: '/' })
  assert.deepEqual(owner('/eidos'), { system: 'eidos', path: '/' })
  assert.deepEqual(owner('/hyperbase'), { system: 'hyperbase', path: '/' })
  assert.deepEqual(owner('/hyperbase/projects/explorer-filters-7'), { system: 'hyperbase', path: '/projects/explorer-filters-7' })
  assert.equal(owner('/hyperbases'), undefined, 'a folder is a whole segment')
  assert.equal(owner('/projects'), undefined, 'Studio’s pages have no place of their own outside its folder')
  assert.deepEqual(owner('/merons/noi/eio'), { system: 'mero', path: '/merons/noi/eio' })
  assert.deepEqual(owner('/review/abc'), { system: 'mero', path: '/review/abc' })
  assert.equal(owner('/account/sign-in'), undefined)
  assert.equal(owner('/government'), undefined, 'a folder is a whole segment')
  assert.deepEqual(owner('/at/hiddenstack'), { system: 'base', path: '/@hiddenstack' })
})

test('a public profile is /@handle on the base name, and only there (agreed 9 Nov)', () => {
  assert.deepEqual(desk('no-origins.localhost', '/@hiddenstack'), { go: 'rewrite', path: '/at/hiddenstack' })
  assert.deepEqual(desk('no-origins.localhost', '/%40claude-code'), { go: 'rewrite', path: '/at/claude-code' })
  assert.deepEqual(desk('no-origins.localhost', '/at/hiddenstack'), { go: 'redirect', system: 'base', path: '/@hiddenstack' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/@hiddenstack'), { go: 'redirect', system: 'base', path: '/@hiddenstack' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/at/hiddenstack'), { go: 'redirect', system: 'base', path: '/@hiddenstack' })
  assert.deepEqual(desk('localhost', '/@hiddenstack'), { go: 'redirect', system: 'base', path: '/@hiddenstack' })
  assert.deepEqual(desk('no-origins.localhost', '/@hiddenstack/more'), { go: 'redirect', system: 'mero', path: '/@hiddenstack/more' })
  assert.deepEqual(desk('example.com', '/@hiddenstack'), { go: 'on' })
  assert.equal(originOf('base', 'http', '3000', D), 'http://no-origins.localhost:3000')
  assert.equal(originOf('base', 'https', '', 'no-origins.com'), 'https://no-origins.com')
})

test('gov and eidos show their folder at the top of their name', () => {
  assert.deepEqual(desk('gov.no-origins.localhost', '/account/sign-in'), { go: 'rewrite', path: '/gov/account/sign-in' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/account'), { go: 'rewrite', path: '/gov/account' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/'), { go: 'rewrite', path: '/gov' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/problems'), { go: 'rewrite', path: '/gov/problems' })
  assert.deepEqual(desk('eidos.no-origins.localhost', '/'), { go: 'rewrite', path: '/eidos' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/merons/noi'), { go: 'on' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/'), { go: 'on' })
})

test('hyperbase shows Studio’s folder at the top of its name (15 Nov)', () => {
  const H = 'hyperbase.no-origins.localhost'
  assert.deepEqual(desk(H, '/'), { go: 'rewrite', path: '/hyperbase' })
  assert.deepEqual(desk(H, '/projects'), { go: 'rewrite', path: '/hyperbase/projects' })
  assert.deepEqual(desk(H, '/projects/new'), { go: 'rewrite', path: '/hyperbase/projects/new' })
  assert.deepEqual(desk(H, '/projects/explorer-filters-7'), { go: 'rewrite', path: '/hyperbase/projects/explorer-filters-7' })
  assert.deepEqual(desk(H, '/orders'), { go: 'rewrite', path: '/hyperbase/orders' })
  assert.deepEqual(desk(H, '/teams/build'), { go: 'rewrite', path: '/hyperbase/teams/build' })
  assert.deepEqual(desk(H, '/runs/412'), { go: 'rewrite', path: '/hyperbase/runs/412' })
  assert.deepEqual(desk(H, '/score'), { go: 'rewrite', path: '/hyperbase/score' })
  assert.deepEqual(desk(H, '/space'), { go: 'rewrite', path: '/hyperbase/space' })
  // One address for each page, and each page on its own name.
  assert.deepEqual(desk(H, '/hyperbase/runs/412'), { go: 'redirect', system: 'hyperbase', path: '/runs/412' })
  assert.deepEqual(desk(H, '/merons'), { go: 'redirect', system: 'mero', path: '/merons' })
  assert.deepEqual(desk(H, '/gov/roles'), { go: 'redirect', system: 'gov', path: '/roles' })
  assert.deepEqual(desk(H, '/@hiddenstack'), { go: 'redirect', system: 'base', path: '/@hiddenstack' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/hyperbase'), { go: 'redirect', system: 'hyperbase', path: '/' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/hyperbase/teams/build'), { go: 'redirect', system: 'hyperbase', path: '/teams/build' })
  assert.deepEqual(desk('no-origins.localhost', '/hyperbase/score'), { go: 'redirect', system: 'hyperbase', path: '/score' })
  assert.deepEqual(desk('localhost', '/hyperbase/projects/new'), { go: 'redirect', system: 'hyperbase', path: '/projects/new' })
  assert.deepEqual(desk('hyperbase.no-origins.com', '/runs', 'no-origins.com'), { go: 'on' }, 'another base name is not ours here')
  assert.deepEqual(frontDesk('hyperbase.no-origins.com', '/runs', 'no-origins.com'), { go: 'rewrite', path: '/hyperbase/runs' }, 'hosted, the same with another base')
  assert.equal(originOf('hyperbase', 'http', '3000', D), 'http://hyperbase.no-origins.localhost:3000')
  assert.equal(originOf('hyperbase', 'https', '', 'no-origins.com'), 'https://hyperbase.no-origins.com')
})

test('one address for each page: other names send you to its own', () => {
  assert.deepEqual(desk('gov.no-origins.localhost', '/gov/account/sign-in'), { go: 'redirect', system: 'gov', path: '/account/sign-in' })
  assert.deepEqual(desk('gov.no-origins.localhost', '/merons'), { go: 'redirect', system: 'mero', path: '/merons' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/gov/account/sign-in'), { go: 'redirect', system: 'gov', path: '/account/sign-in' })
  assert.deepEqual(desk('mero.no-origins.localhost', '/eidos'), { go: 'redirect', system: 'eidos', path: '/' })
  assert.deepEqual(desk('eidos.no-origins.localhost', '/review'), { go: 'redirect', system: 'mero', path: '/review' })
  assert.deepEqual(desk('no-origins.localhost', '/'), { go: 'redirect', system: 'mero', path: '/' })
})

test('plain localhost sends you on; other names are left alone', () => {
  assert.deepEqual(desk('localhost', '/merons'), { go: 'redirect', system: 'mero', path: '/merons' })
  assert.deepEqual(desk('localhost', '/gov/account/link'), { go: 'redirect', system: 'gov', path: '/account/link' })
  assert.deepEqual(desk('127.0.0.1', '/'), { go: 'redirect', system: 'mero', path: '/' })
  assert.deepEqual(desk('example.com', '/merons'), { go: 'on' })
})

test('addresses keep the scheme and port the app was reached on', () => {
  assert.deepEqual(splitHost('gov.no-origins.localhost:3000'), { hostname: 'gov.no-origins.localhost', port: '3000' })
  assert.deepEqual(splitHost('GOV.No-Origins.com'), { hostname: 'gov.no-origins.com', port: '' })
  assert.deepEqual(splitHost('[::1]:3000'), { hostname: '[::1]', port: '3000' })
  assert.equal(originOf('mero', 'http', '3000', D), 'http://mero.no-origins.localhost:3000')
  assert.equal(originOf('gov', 'https', '', 'no-origins.com'), 'https://gov.no-origins.com')
})

test('signing in sends you back only to our own names, never to the sign-in itself', () => {
  const home = 'http://mero.no-origins.localhost:3000/merons'
  const back = b => backTo(b, home, D)
  assert.equal(back('http://mero.no-origins.localhost:3000/review/abc?x=1'), 'http://mero.no-origins.localhost:3000/review/abc?x=1')
  assert.equal(back('http://eidos.no-origins.localhost:3000/'), 'http://eidos.no-origins.localhost:3000/')
  assert.equal(back('/problems'), '/problems')
  assert.equal(back('/account'), '/account', 'your account is a page to go back to')
  assert.equal(back('http://hyperbase.no-origins.localhost:3000/projects/new'), 'http://hyperbase.no-origins.localhost:3000/projects/new', 'Studio is one of our own names')
  for (const away of [undefined, null, '', 'https://elsewhere.example/', '//elsewhere.example', '/\\elsewhere.example', 'javascript:alert(1)',
    'http://no-origins.localhost.example/', 'http://user:pw@mero.no-origins.localhost:3000/', 'http://gov.no-origins.localhost:3000/account/sign-in',
    'http://gov.no-origins.localhost:3000/account/link', '/account/sign-in', '/account/link', '/gov/account/sign-in?back=/', '/account/sign-up',
    '/account/lost', 'http://gov.no-origins.localhost:3000/account/sign-up', '/account/email', 'review',
    // A browser drops tabs and newlines in a URL, and reads a backslash as a slash (found 9 Nov).
    '/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/ /evil.example', '\t//evil.example', '/\\evil.example',
    '/x/../account/sign-in', 'http://evil.no-origins.localhost:3000/', 'http://no-origins.localhost.evil.example/'])
    assert.equal(back(away), home, JSON.stringify(away))
  assert.equal(back('/%09/evil.example'), '/%09/evil.example', 'an escaped tab stays a path on our name')
  assert.equal(back('/review?x=1#y'), '/review?x=1#y')
  // Hosted, only HTTPS.
  assert.equal(backTo('http://mero.no-origins.com/merons', home, 'no-origins.com'), home)
  assert.equal(backTo('https://mero.no-origins.com/merons', home, 'no-origins.com'), 'https://mero.no-origins.com/merons')
})

test('the forms that send an email say where it waits on this Mac, and nothing hosted', () => {
  assert.equal(mailInbox(D, undefined), 'http://localhost:55324')
  assert.equal(mailInbox(D, 'http://localhost:9000'), 'http://localhost:9000')
  assert.equal(mailInbox('no-origins.com', 'http://localhost:9000'), undefined)
})

// The two names, and no other (the user, 18 Nov): no-origins.com hosted, no-origins.localhost here.
test('NOI_DOMAIN is one of the two names, or the app does not start', () => {
  assert.deepEqual([...NAMES], ['no-origins.com', 'no-origins.localhost'])
  assert.equal(baseName(undefined), 'no-origins.localhost', 'not set: this Mac')
  assert.equal(baseName('no-origins.com'), 'no-origins.com')
  assert.equal(baseName(' No-Origins.COM '), 'no-origins.com', 'a name has no case')
  for (const other of ['', 'localhost', 'no-origins.test', 'noi-git-main.vercel.app', 'gov.no-origins.com', 'no-origins.com.evil.example', 'example.com']) {
    assert.throws(() => baseName(other), /answers only on no-origins.com and no-origins.localhost/, JSON.stringify(other))
  }
})

test('Eidos’s links know the same two names: every page of the app is a link inside', () => {
  for (const name of NAMES) {
    for (const system of ['base', 'gov', 'mero', 'eidos', 'hyperbase']) {
      for (const [proto, port] of [['https', ''], ['http', '3000']]) {
        const at = originOf(system, proto, port, name)
        assert.equal(insideNoOrigins(`${at}/review`), true, at)
      }
    }
  }
  // A name the app refuses is one the links call outside.
  for (const other of ['no-origins.test', 'noi-git-main.vercel.app']) {
    assert.throws(() => baseName(other))
    assert.equal(insideNoOrigins(`https://${other}/`), false, other)
  }
})
