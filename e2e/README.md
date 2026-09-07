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
response; gate the action, not the route), [`redeem-gift-code.spec.ts`](redeem-gift-code.spec.ts)
(the same two promises on a route linked from every screen, plus the form arriving server-rendered)
and [`not-found.spec.ts`](not-found.spec.ts) (a real 404 status on both surfaces, and the webview 404
offering no way out of the app),
[`app-privacy-settings.spec.ts`](app-privacy-settings.spec.ts) (the one `/app/*` screen that renders a
**website** component — so the assertion is that every link on it stays inside `/app/`), plus
[`search.spec.ts`](search.spec.ts) — the one screen that is
public **on purpose**, so the assertion is the inverse of space-visibility's: a signed-out visitor
must get a working field rather than a prompt, and the rail must reach it with a real anchor — and
[`get-star.spec.ts`](get-star.spec.ts), where the two promises meet on a **till**: a guest gets the
prices *and* an enabled Pay button, because the press is the gate, and `?need=` is swept off the URL
once it has been read, [`my-star.spec.ts`](my-star.spec.ts) — the first spec to use the session
fixture, covering the shared `LedgerPanel` from the other screen that draws it (a sticky month header
that must park *below* the 60px bar, and the breakpoint-driven `fullBleed` that must not move when the
reader scrolls) — and [`wallet.spec.ts`](wallet.spec.ts), covering all four wallet routes at
once: `noindex` on each, the guest's **Sign in** control on each, the `?currency=tvs` redirect that
must move *only* with its parameter (it once shadowed a real page), and the §6 surface rule, which is
two values of one token across a breakpoint and so cannot be checked at one width. Lastly
[`premium.spec.ts`](premium.spec.ts), whose SEO assertion is the **inverse** of every other account
screen's — `/premium` is the one that is deliberately `index, follow`, so the spec pins that it stays
indexable and that a crawler receives its pitch from the first response, plus the two claims about
money the screen computes itself (a card per package the catalogue offers and no more, and the annual
discount against the year it was derived from).

And [`create-action.spec.ts`](create-action.spec.ts) — the shell's `+` / FAB, the only control on
*every* page: both navigation shells are mounted at once and each renders its own Create list, so
the claim is that a press reaches **its** shell's surface and not the other's, that the option whose
flow is not built is a real `disabled` control rather than a faded one that still takes a press, and
that only the app-only option raises the QR prompt — plus the auth-gated-action rule above (a guest
gets the login dialog and keeps the URL).

Two things worth knowing before adding a spec:

- The server starts from `next build && next start`, not `next dev`, because `generateMetadata`,
  ISR and real 404 statuses only behave correctly in a production build. Expect the first run to
  take a while.
- Anything needing a signed-in session uses **[`fixtures/session.ts`](fixtures/session.ts)**:
  `await signedIn(page, handlers)` in a `beforeEach`. It seeds the token store in `localStorage`
  (auth is deliberately not cookie-based) **and** answers the API, because seeding alone is not
  enough — `AuthProvider` calls `/me` with the seeded bearer, a made-up one gets a 401, and the
  account is dropped back to anonymous, so the spec would silently be testing the signed-out screen.
  A path no handler covers answers **599 with the path in the body** rather than reaching the
  network: a spec must not depend on a backend being up, and a silent fall-through is how one ends up
  asserting on somebody's dev database. Payload *shapes* belong in Vitest against real captures; the
  fixture exists so a browser-only claim can be made about a signed-in screen.

- A spec about the **signed-out** screen needs `asGuest(page)` from the same file, and this is less
  obvious than it sounds. The app always keeps a session, so arriving with no token starts an
  *anonymous* bootstrap — four calls off the machine, two of them to Firebase. A signed-out spec was
  therefore depending on Firebase and a reachable dev backend, and it showed up as a flake under
  parallel load. `asGuest` aborts every off-origin request; an anonymous account is not a signed-in
  one, so nothing a signed-out spec asserts changes.
