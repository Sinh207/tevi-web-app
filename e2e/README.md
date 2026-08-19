# End-to-end specs

`pnpm test:e2e` — config in [`../playwright.config.ts`](../playwright.config.ts).

Vitest covers pure logic; there is no component-render testing in this repo. So Playwright is the
**only** place some rules can be checked at all, and those are the ones to write first:

- **What a crawler receives.** Is the channel's name and bio in the HTML of the first response,
  not just after hydration? Is `<title>` right? Is the ProfilePage JSON-LD present and parseable?
- **HTTP status, not just page content.** A missing channel must be a real `404`, a
  differently-cased slug a `308` that keeps its query string, and — the one that matters most — an
  upstream 5xx must be a `200` with `noindex`, never a 404. A unit test pins
  `resolveChannelFetchStatus`; only a browser pins what the route actually returns.
- **Walls.** Suspended / blocked / protected / unpublished must render an explanation and *not*
  the content behind it.
- **Auth-gated actions.** Pressing Follow while signed out opens the login dialog rather than
  navigating to `/login` — "gate the action, never the route".
- **The sticky stack.** The page bar and the tab row must not double up or leave a gap while
  scrolling.

Specs that exist today: [`splash.spec.ts`](splash.spec.ts) (the cover, and the SEO promise it
shipped under), [`space-visibility.spec.ts`](space-visibility.spec.ts) (`noindex` in the first
response; gate the action, not the route) and [`not-found.spec.ts`](not-found.spec.ts) (a real 404
status on both surfaces, and the webview 404 offering no way out of the app).

Two things worth knowing before adding a spec:

- The server starts from `next build && next start`, not `next dev`, because `generateMetadata`,
  ISR and real 404 statuses only behave correctly in a production build. Expect the first run to
  take a while.
- Anything needing a signed-in session needs the token store seeded in `localStorage` before the
  page loads (`page.addInitScript`), since auth is deliberately not cookie-based. There is no
  fixture for that yet — write it as `e2e/fixtures/` when the first such spec lands, rather than
  copying the setup into each file.
