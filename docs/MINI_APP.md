# Mini apps

**Third-party web applications, framed inside Tevi.** A creator attaches one to their space; a
reader presses Open and it runs in a window over whatever page they were on. The apps are somebody
else's code, on somebody else's host, and they talk to their host over a `postMessage` bridge.

This document is the **contract and the web player's side of it**. The protocol is not ours to
design: the mobile apps host mini apps in a WebView and have implemented this bridge already, so the
web is the third implementation and every action name in it is a string some shipped app already
sends. Ported from legacy's `src/containers/miniApp/MINIAPP_INTEGRATION.md` (the partner-facing
document, in Vietnamese) and `MINIAPP.md` (its web player's own notes).

- **Code:** [`src/features/mini-app/`](../src/features/mini-app/) — see its `index.ts` for the map.
- **Open questions:** **B82** in [`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md).
- **Harness:** `/dev/mini-app` (dev only).

---

## 1. The three hosts

```
                    ┌── iOS      WKWebView   + `TeviJSInterface` message handler
mini app (a page) ──┼── Android  WebView     + `TeviJSInterface` JS interface
                    └── web      <iframe>    + window.postMessage      ← this feature
```

A native host receives `{ action, options }` on its interface and calls back into the page with
`TeviJS.onJSCall(<base64 JSON>)`. The web host has no interface to register, so both directions are
`postMessage`. Everything else — the action names, the options, the reply fields — is shared.

**A webview mounts no player.** `/app/*` screens get the base providers only (see
[`WEBVIEW.md`](WEBVIEW.md)), and a mini app opened inside the native app is hosted by the native app
through its own bridge. The web player is a website feature.

---

## 2. The frame URL

```
{mini_app_url}?user={userId}&slug={mySlug}&lan={locale}&v={cachedVersion}&campaign={utm}&app_id={appId}
```

| Parameter | What it is |
| --- | --- |
| `user` | the signed-in account's id |
| `slug` | **the reader's own** space slug, not the space they are looking at |
| `lan` | UI locale (`vi`, `en`, …) |
| `v` | the version this **device** last saw this app report — the cache bust, §5 |
| `campaign` | `utm_campaign` off the page that opened the app, when there is one |
| `app_id` | the app's id in the developer platform |

Built by [`lib/frame-url.ts`](../src/features/mini-app/lib/frame-url.ts). Three properties worth
knowing:

- **Each is omitted when the host does not know it**, not sent blank. `searchParams.get()` cannot
  tell an absent parameter from an empty one, so this is the same thing to the app and an honest URL.
  The contract document writes them all out because a native host concatenates a string.
- **The app's own query survives.** `?table=4&mode=ranked` is the app's; only a collision on one of
  the six names above is overwritten.
- **The URL is frozen for the frame's lifetime.** A background `/me` refetch, or the reader changing
  interface language mid-game, must not reload a running application. A real reload goes through the
  tab's `reloadKey`, which remounts the element.

Never put a session token in these parameters. The player is same-origin with the site and the app
gets a **scoped** token over the bridge (§4.2) — not the bearer.

---

## 3. Message envelopes

There are **two**, and legacy contains both halves of a mismatch:

| | inbound (app → host) | outbound (host → app) |
| --- | --- | --- |
| `action` — legacy's host | `{ action, options }`, `options` a JSON **string** | `{ action, call, userInfo… }` |
| `eventType` — legacy's SDK, browser path | `{ eventType, eventData }` | `{ eventType, eventData }` |

Legacy's web host reads only the first; legacy's own SDK sends and reads only the second. So an
SDK-based mini app and legacy's web player cannot hear each other in either direction, and nothing
in a message says which the app was built against.

This player therefore **accepts both** and replies in whichever envelope that frame last used,
sending both only for a host-initiated event that precedes the app's first word (the header
buttons). `lib/protocol.ts` owns that, and it is tested. B82 asks which envelope is supported so the
other can eventually be dropped.

### Reply fields

```jsonc
{ "action": "action.user.billy.topup", "call": "ok" }
{ "action": "action.user.billy.topup", "call": "cancel",  "response": false }
{ "action": "action.user.billy.topup", "call": "<reason>", "response": false, "message": "<reason>" }
```

`call` is the contract's verdict field. `response: false` is legacy's other way of saying "did not
happen" and is what shipped apps branch on, so **both are sent** on a failure — dropping the one an
app reads is a silent hang. The reason is always *our* sentence, never a backend error body.

**Every handled action posts exactly one reply, including failures and unknown actions.** Legacy
leaves four paths silent (a failed `getInfo`, `checkRemainingUser`, a network error on `buyItem`,
and anything unrecognised), and a silent path is an app stuck on its loading screen forever.

---

## 4. Actions

### 4.1 Overview

| Action | Web behaviour |
| --- | --- |
| `action.app.loadConfig` | replies with `{ app_id, app_name, app_url }`; records the reported version (§5) |
| `action.user.core.getInfo` | replies with the account and a per-app token (§4.2) |
| `action.user.core.checkRemainingUser` | replies `ok` with nothing — no such concept on web |
| `action.user.billy.buyItem` | `POST billy/v1/ecom/purchase/` (§4.3) |
| `action.user.billy.topup` | confirmation dialog, then `POST billy/v1/billing/game/deposit/` (§4.4) |
| `action.purchaseStar` | raises the Star purchase sheet |
| `action.quitGame` | closes that tab |
| `action.app.showBackButton` / `showCloseButton` | shows the leading control in the tab strip |
| `action.executeLink` | opens another mini app, a share sheet, or a link (§4.5) |
| `action.scanQRCode` | **unsupported** — replies with a reason |
| `action.downloadMedia` | opens the vetted URL in a new tab (§4.6) |
| `action.createPost` | **unsupported** — the composer does not exist in this app yet |
| `action.app.*ButtonClicked` | pushed **into** the app when the host's chrome is pressed; also accepted upward |

### 4.2 `getInfo` — the account, and a token scoped to one app

```jsonc
// → { "action": "action.user.core.getInfo", "options": "{\"app_id\":\"my_app\"}" }
// ← { "call": "ok",
//     "userInfo": { "user_app_token": "eyJ…", "user_id": "12345", "user_slug": "ada",
//                   "device_id": "…", "source_url": "https://tevi.com/@ada" },
//     "userParam": {} }
```

The token comes from `GET developer/api/v1/user/auth-token/?app_id=`, and it is **not** the session
bearer: handing a mini app the token that can read `/me` and move money would defeat the point of
the frame.

**An app with no `app_id` gets an `ok` with no token.** The Mini App Center is in that state, and so
is any app opened by bare URL. It is a documented state, not a failure. A *transport* failure (401,
5xx, network) replies with a reason so the app can retry — legacy replies nothing at all.

### 4.3 `buyItem`

```jsonc
// → options: { "item_id": "item_001", "price": 100, "metadata": { "level": 5 } }
```

Sent as `{ product_id, metadata }`. **The price is not sent** — a client-supplied price on a purchase
is either ignored or trusted, and only one of those is safe. It is parsed so the top-up copy can
name a real shortfall, and an unusable one (negative, fractional, non-numeric) is simply forgotten
rather than blocking a purchase the backend would accept.

**The backend decides affordability.** `422` with code `EC0001` is what "not enough Star" means, at
which point the reader is offered Star — pre-selected to the gap when the app's stated price makes
that computable. There is no local pre-check: a browser cannot be trusted with a price, and the
cached balance can be a minute old.

Not retried on a 5xx. `createApiModel` withholds retries from POSTs unless the caller opts in, and
this is exactly the case that exists for: a 502 can arrive *after* the charge landed (B62).

### 4.4 `topup`

```jsonc
// → options: { "channel_id": "ch_001", "amount": 500, "deposit_token": "tok_xyz", "metadata": {…} }
```

The one action the host confirms with a dialog, because it moves Star **out of** the Tevi account and
into the app's own wallet, where Tevi's ledger stops explaining it. `buyItem` is not confirmed: the
reader already pressed buy on a screen inside the app that named the item and its price.

Cancelling replies `cancel` — a mini app shows different copy for that than for a failure — and so
does dismissing the dialog with Escape or the scrim.

A second `topup` while a dialog is open is **refused**, not queued: two confirmations for two
amounts, one dialog, is how a reader agrees to the wrong number.

The amount is checked against the local balance first, which is the one place this client guesses.
B82 asks whether the deposit endpoint reports `EC0001` like `purchase/` does; if it does, the local
check comes out.

### 4.5 `executeLink`

```jsonc
// → options: { "metadata": { "type": "app" | "share" | "external_link" | "",
//                            "title", "link", "space_url", "app_url", "app_key", "app_icon" } }
```

| `type` | Web behaviour |
| --- | --- |
| `app` | opens `app_url` as **another tab** in the player — this is how a row in the Mini App Center launches what it names |
| `share` | the platform share sheet on `link` |
| `external_link`, or empty | opens `space_url` if present, else `link`, in a new tab |

`space_url` outranking `link` when no type is given is the contract's rule, and the useful one: a
Tevi deep link is somewhere this app can actually go.

Every URL goes through `shared/lib/safe-url` first. `window.open` on a `javascript:` URL executes in
**this** document.

### 4.6 The two unsupported actions, and one partial

- **`scanQRCode`** — not "not implemented yet". A browser has no camera scanner to open, and the
  frame is deliberately not delegated camera access (§6). Replied to, so the app can fall back to
  asking the reader to type the code.
- **`createPost`** — the composer does not exist in this app yet. When it does, this opens it
  pre-filled from `{ text, type, url }`.
- **`downloadMedia`** — opens the URL in a new tab rather than saving it. `<a download>` is ignored
  for a cross-origin URL, so legacy's hidden-anchor click navigates instead of downloading; claiming
  otherwise in the reply would be a lie the app builds a "Saved!" toast on.

### Popups need user activation, and the reply says when they were refused

`executeLink` and `downloadMedia` both call `window.open`, from a `message` handler. A popup is only
allowed while the page has **transient user activation** — and it normally has it, because the spec
hands activation from a click inside a frame up to its ancestors, so the reader's tap on a button
inside the mini app counts for the host too.

It does *not* have it when the app sends the message on a timer, off its own socket, or more than a
few seconds after the tap. `window.open` then returns `null` and nothing happens. Legacy cannot tell
that from success and replies `ok`, so an app shows "Saved!" over a download that never started.
Here the reader gets a toast explaining the browser refused, and the reply is
`{ call: 'popup blocked', response: false }`.

---

## 5. Versions and caching

The contract puts cache invalidation on the host: the app announces `version` in `loadConfig`, and a
host holding a different one is holding a stale cache and must drop it and reload. The native hosts
wipe the WebView's data store.

**A web host cannot** — there is no API to clear a cross-origin frame's HTTP cache from the embedding
page. So it changes the URL instead: the version rides in `?v=`, and a changed `v` is a resource the
browser has never cached.

```
first ever load        v absent  →  app reports 1.0.0  →  remember it, do NOT reload
next load              v=1.0.0   →  app reports 1.0.0  →  nothing to do
after a deploy         v=1.0.0   →  app reports 1.1.0  →  remember, reload once with v=1.1.0
```

The first row is why remembering and reloading are two decisions: the frame in front of the reader
*is* that version already, and reloading would flash on the first launch of every app. The third row
cannot loop, because the reloaded frame's URL already carries the new version.

Stored per **device**, not per account (`STORAGE_KEYS.miniAppVersions`) — which of the ten signed-in
accounts is looking at an app has no bearing on whether the browser is holding a stale copy of it.
30-day TTL, 50 apps. [`lib/app-version.ts`](../src/features/mini-app/lib/app-version.ts).

---

## 6. Security

A mini app is untrusted code we deliberately run. Six controls, each stated where it is enforced:

1. **The URL is vetted before it is a `src`.** `shared/lib/safe-url` — `http(s)` only. This is the
   one sink where `javascript:` executes as us with no click to intercept, so it is checked at the
   source (`normalizeMiniAppConfig`) *and* at the sink (`buildMiniAppFrameUrl`).

2. **`sandbox`**, computed per frame:
   `allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox`.
   What is absent matters more: **no `allow-top-navigation`** (a frame that could replace the tab is
   a phishing primitive) and **no `allow-downloads`** (downloads go through the host's vetted
   `downloadMedia`). `allow-same-origin` is **dropped for an app served from this origin** — with
   `allow-scripts`, the pair would let the frame script the parent and read `localStorage`, where
   every account's refresh token lives.

3. **`allow="clipboard-write"`, and nothing else.** Legacy also delegates camera and microphone. A
   delegated permission is requested *as this origin*, so the browser's prompt says "tevi.com wants
   your camera" for something a third party asked for. Nothing needs them.

4. **`referrerPolicy="origin"`** — the origin, without the path. The path is the concern: a full
   `Referer` hands a third party the exact Tevi page the reader was on, including a private space
   they can only see because they were followed into it. **Not `no-referrer`**, though: mini apps
   legitimately read the referrer to identify their host (legacy's own SDK derives `parentOrigin`
   from it), and an app that checks it would refuse to run against a host that sends nothing.

5. **Messages are matched to their own frame**, by `event.source === iframe.contentWindow`, not just
   by origin. Two tabs of the *same* app share an origin, so origin alone means each answers the
   other's `getInfo` and a `buyItem` is attempted twice. Replies always target the app's origin,
   never `'*'` — a `getInfo` reply carries a token.

6. **Options are parsed, and the request body is rebuilt.** `api/types.ts` is the only schema in the
   app guarding against the *frame* rather than the backend. It is not a second authorisation layer
   — the backend is the authority on price and balance — but it stops a `NaN` amount, a negative
   one, an `item_id` that is an object, and a cyclic `metadata` (which survives structured clone and
   then throws inside `JSON.stringify`, leaving the app waiting forever).

### CSP

`frame-src` is an allow-list everywhere else in `shared/config/csp.ts`, and it **cannot be one
here**: `channel.mini_app_url` is set per creator in the backoffice and points at whatever host the
app's publisher uses. An unlisted origin does not degrade — the frame is blocked and paints nothing,
reporting only to the console.

So the default is `https:` for **`frame-src` only**. It widens *framing*, not scripting
(`script-src` stays nonce + `'strict-dynamic'`), the frame is sandboxed as above, and
`frame-ancestors 'self'` is untouched. `NEXT_PUBLIC_MINIAPP_FRAME_ORIGINS` replaces the wildcard with
a curated list per environment. B82's fourth point asks whether such a list can exist.

---

## 6a. Entering a space that *is* a mini app opens it

`has_mini_app` marks a game or a service, not a profile to browse, so a space that has one opens it
on arrival rather than making the reader find a button. Ported from legacy, which does the same from
its channel viewer.

Two things decide whether it fires, and neither is a condition written in the hook:

- **Where it is called from.** `useAutoOpenMiniApp(channel)` is mounted by
  `features/channel`'s `ChannelViewerActions` — the row that carries the Open button — and
  `channel-view.tsx` renders that row only when the space's actions are offered at all. So a
  suspended space, a blocked account, a protected space the reader has not been let into, a
  sensitive space they have not agreed to see, and the beat before ownership resolves all withhold
  the auto-open for free. The **owner** of the space gets the owner row instead, so their own app
  does not open by itself and they have no Open button either — consistent, and a product decision
  to change rather than a gap to patch.
- **`autoOpenDecision`** (`lib/auto-open.ts`, tested): the space must have a usable app, the reader
  must have a **real account** — a guest is *skipped*, never shown a sign-in dialog for navigating to
  a page — and the same app is not opened twice, which is also what makes closing the player on that
  space stick.

That last rule is remembered as **which app was opened**, not *that* one was, and the difference is a
bug legacy ships: its boolean ref is reset by a second effect that React runs *after* the opening
one, so walking from one mini-app space to another leaves the ref set and the second space never
opens. The app appears on the first mini-app space of a session and on no other, which reads as
flakiness rather than as a rule.

---

## 7. State, and who owns what

| | owner | why |
| --- | --- | --- |
| tabs, window rect, minimise | **Zustand** (`store/mini-app-store.ts`) | pure UI state; openers are everywhere, the renderer is one place |
| the per-app token, purchases, deposits | **TanStack Query** (`api/mini-app-api.ts`) | server state; the token deduplicates through `fetchQuery`, and every write invalidates `balanceKeys.all` |
| "the reader needs Star" | **event bus** (`payment:star-purchase-requested`) | the sheet is in `features/payment`, which imports `features/balance`; announcing avoids closing a barrel cycle |

No socket. A mini app's own realtime traffic is its business, inside its frame.

The per-app tokens are **removed** from the cache when the last tab closes (`MiniAppHost`). Their 30s
lifetime exists only to collapse concurrent `getInfo` calls into one request; once no app is open
there is nothing left to collapse, and what remains is a third party's credential sitting in memory
for no reason.

The rules a reader can *see* are pure functions with tests, not properties of the store: the tab
list (`lib/tabs.ts`), the window geometry (`lib/window-geometry.ts`), the wire (`lib/protocol.ts`),
the URL (`lib/frame-url.ts`), the version memory (`lib/app-version.ts`).

**Every tab's frame stays mounted**, hidden with `display: none`. A mini app is a running
application — a game mid-round, a socket, a video — and unmounting it to switch tabs would reload it
from scratch each time.

## 7a. Where the player sits in the app's layers

`z-40`, and that number is decided by what must be **above** it: every dialog a mini app can raise
is `z-50` (sign-in, the Star purchase sheet, its own top-up confirmation), and an application drawn
on top of the question it just asked is worse than any alternative.

Which leaves one conflict, because the mobile tab bar is also `z-50`: above the bar means over 50,
below the dialogs means under 50, and no number is both. **The bar yields** — `TabBarShell` reads
`useMiniAppCoversScreen()` and renders neither the bar nor the 84px it reserves while a mini app
covers the screen. That is also what the native hosts do: a full-screen mini app does not get the
host's navigation over the top of it, and the player's own close control is how you leave.

The account drawer (`z-60`) stays above the player, which is right — it is how you switch or sign out
of the account the app is running for.

The window is **two** elements, not one: an outer positioner and an inner surface that clips. The
corner radius needs a clip and the resize zones stick 4px *outside* the box, and a clip removes them
from hit-testing as well as from paint — which is why legacy's handles, on a single clipped element,
are a 4px target instead of an 8px one.

### The wait has the app's name on it

A frame starting is not the usual sub-second wait: it is a third-party host, a cold DNS lookup, a
bundle, and whatever the app does before it paints. So the loading state is the app's own **mark and
name** over the frame's surface, with the DS `Loader` under them — the same thing a native launcher
shows, and it also answers which of five tabs is the one still coming up.

Two details are load-bearing rather than decorative:

- **It fades in, and the surface under it does not.** A cached app can paint in under 100ms, and a
  splash that appears and disappears inside that window is a flicker; fading the content over 200ms
  means a fast app is gone before the splash is fully drawn. The *surface* is opaque from the first
  frame, so a half-built layout is never visible through it.
- **It fades out and then unmounts**, held for the length of the fade by `MiniAppFrame` — a component
  cannot unmount itself and animate while doing it. The timer is not `onTransitionEnd`, which never
  fires when there is no transition to end: under `prefers-reduced-motion` that would leave an
  opaque overlay sitting on the app forever.

### The app is always given a phone-shaped box

Worth knowing when integrating: **the frame never gets a desktop-wide viewport.** The floating window
*is* the phone ratio (420:730), and maximising on a desktop does not hand the app the whole area —
it constrains the frame to that same ratio, centres it, and fills the rest with the host's own
surface, with a hairline on each side of the app.

That is not a stylistic preference. A mini app is drawn for a phone, so an app that centres its own
narrow column inside a 2000px frame renders as a strip of content in a field of its own background —
and when that background happens to match the host's, the result reads as a broken page rather than
as an app in a window. Legacy letterboxes for the same reason (`aspectRatio: '9/16'` on its iframe),
though it applies it unconditionally, which puts bars above and below on a phone. Here a phone —
narrower than the ratio — fills completely.

---

## 8. Deliberate divergences from legacy

Each of these is a behaviour change, not a port gap.

| | legacy | here | why |
| --- | --- | --- | --- |
| opening an app while one is open | replaces the **active tab's** app | opens a new tab | destroying the game somebody is playing is not a feature |
| message filtering | `event.origin` only | origin **and** `event.source` | two tabs of one app cross-answered each other |
| reload | `iframe.src = iframe.src` | remount via `reloadKey` | the assignment is a same-origin trick; cross-origin it loses the app's current route or throws |
| blank tab + app picker | a tab with three hardcoded fixtures and a `TODO` | `+` opens the **Mini App Center** | there is no app-list endpoint; the Center *is* the picker, and it is a mini app |
| out of Star | its own dialog linking to `/get-star` in a new tab | the app's real Star purchase sheet | `features/payment` exists now |
| failed `getInfo`, `checkRemainingUser`, unknown actions | no reply | a reply | see §3 |
| the space's Open button | hidden unless signed in | rendered; the **press** raises sign-in | hiding it tells a visitor the space has no app |
| auto-open on entering a mini-app space | a boolean ref, reset by a later effect | remembers **which** app was opened | legacy's ordering means the *second* mini-app space of a session never opens |
| camera / microphone | delegated to the frame | not delegated | §6 |
| tab icon fallback | a raster mark on the CDN | the DS sprite's `grid-category` | `STATIC_ASSETS.md` |
| group divider in the ⋯ menu | an MUI `<Divider/>` before Reload | dropped | `ActionMenuItem` rules every row full-bleed, so a divider in one gap is a *second* line; the only separator available is built for the DS dropdown and is inset inside a 17px band, which read as a defect |

---

## 8a. The other protocol in legacy's notes, and why it is not here

Legacy's `MINIAPP.md` also documents a **Telegram-style** event set — `theme_changed`,
`viewport_changed`, `main_button_pressed`, `web_app_ready`, `web_app_setup_main_button`,
`web_app_expand` — with a `{ eventType, eventData }` envelope and a host-drawn "main button" below
the frame.

**Legacy's own player does not implement any of it.** Its bridge (`useMiniAppBridge`) handles the
`action.*` set above and nothing else; the `bottomBar` component that document describes is not in
the tree, and no mini app can be sending those events or they would be falling on the floor today.
It reads as a design that was written down and then replaced by the native contract.

So it is deliberately not ported, and this is the note that says so rather than leaving the next
reader to discover a documented feature with no implementation on either side. If a host-drawn main
button is ever wanted, it is a new feature with a new contract — not a port. Note that the envelope
that design uses *is* the one legacy's SDK sends (§3), which is probably how the two drifted apart.

---

## 9. Working on it

`/dev/mini-app` (dev only) opens the real player with fake spaces: tab dedup, the five-tab cap,
drag, resize, minimise, the action-row button and the top-up dialog. What it cannot fake is the
bridge — `example.com` speaks none. For that, serve a page like this and point the harness at it:

```html
<!doctype html>
<script>
  const send = (action, options = {}) =>
      parent.postMessage({ action, options: JSON.stringify(options) }, '*')

  addEventListener('message', event => console.log('host says', event.data))

  send('action.app.loadConfig', { version: '1.0.0', layoutMode: ['Fullscreen'] })
  send('action.user.core.getInfo', {})
  send('action.app.showBackButton', {})
  // and the two that spend money:
  // send('action.user.billy.buyItem', { item_id: 'sword', price: 100 })
  // send('action.user.billy.topup', { channel_id: 'c1', amount: 500, deposit_token: 'tok' })
</script>
```

⚠ A frame served from **this** origin loses `allow-same-origin` (§6), which is correct and worth
knowing while debugging: a local test page on `localhost:3000` cannot use its own storage. Serve it
from a second port.

### One row in the ⋯ menu points at a route that does not exist yet

**Send message** opens `${shareableUrl}/messages`, which is legacy's target verbatim. It resolves on
the legacy app and **404s here** until direct messages are ported. Kept rather than hidden because
the cutover is same-origin and big-bang, so the URL is the one that will be right — but it is the
one row in this feature that is knowingly ahead of the app. Whoever ports messaging should check it
still lands.

### The design-system position

The player is **not in the design system** — Figma draws no window chrome, no tab strip and no
floating player, and `Dialog` (a 370px centred card) and `Sheet` are neither. The geometry is
legacy's, ported number for number, and everything that *can* come from the DS does: tokens, the
type utilities, the sprite, `Loader`, `Dialog` under the top-up confirmation, `ActionMenu` under the
⋯ menu. When design draws this, `lib/window-geometry.ts` and the two local chrome primitives are
what change.
