# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Tevi** — monetization platform for content creators (live streaming, posts, memberships, DMs).
This is a **ground-up rewrite** of the legacy `tevi-web-app` (Next.js Pages Router / JS / MUI) into a
modern stack. Migration strategy is **big-bang**: build to feature-parity by phase, then cut over.
Auth is Bearer-JWT via the Authorization header; tokens live in localStorage under namespaced
`tevi.*` keys (see `shared/lib/storage.ts`) — same-origin cutover keeps sessions (a one-time
migration upgrades legacy keys, e.g. `user_logged_list` / `user_id`, on first load).

**Where the port stands:** the foundation is done and business features are landing on top of it —
29 feature modules today (payment/Stripe, premium, membership, donation, payout, gift-code,
star-transfer, affiliate, analytics, monetization, notification, message, search, channel, event,
identification, mini-app…). What is *not* built yet is read out of the legacy app, which lives at `../tevi-web-app` and stays the reference for
behavior/parity questions. Per-feature open items live in `docs/` — see the map below.

## Stack

- **Next.js 16 App Router** + React 19 + **TypeScript** (strict)
- **Tailwind v4** (CSS-first `@theme` in `globals.css`) + **shadcn/ui** (base-nova, base-ui primitives)
- **TanStack Query + axios** (custom interceptors), **Zustand** for local/UI state only
- **pnpm** + **Biome** (lint+format; 4-space, single quotes, no semicolons, line width 100)
- next-themes (dark mode), i18next (self-managed, statically bundled), Vitest (unit), Playwright (E2E)
- **react-day-picker** — the app's only date UI (`shared/components/calendar.tsx` + `DateField` /
  `DateRangeDialog`). Lazy-loaded via `calendar-lazy.tsx`, which is also the only correct way to mount
  it: `Intl` data differs between Node and the browser, so a server-rendered grid is a hydration
  mismatch. The DS ships no date picker (`docs/DESIGN_SYSTEM.md`), so this is app-authored.
- **embla-carousel-react** — the app's only carousel engine, and reached **only through
  `shared/components/card-carousel.tsx`**. Use it where the thing has real *slide* semantics: one
  card per viewport, dots, "go to slide 3", autoplay. A **row you scroll sideways** (chips, avatars,
  the share sheet's channel discs) is not that and must stay on native `overflow-x-auto` + `snap-x`
  — Embla moves a transform track, which costs momentum, `overscroll-behavior` and the browser
  scrolling a focused child into view. The decision table, the five call sites and the traps:
  [`docs/DESIGN_SYSTEM.md` §10](docs/DESIGN_SYSTEM.md#10-carousels-and-scrolling-rows--which-one-you-are-building).
- **react-hook-form + zod** (`@hookform/resolvers`) for forms; **Stripe**
  (`@stripe/react-stripe-js`) for card payment, **Sumsub** for identity verification, `lottie-web`
  for the few DS animations, `jspdf` for the payout receipt. Every one of those is a third-party
  script or frame, which means the CSP has a say — see
  [Security headers](#security-headers-sharedconfigcspts).

## Commands

```bash
pnpm dev                              # builds the icon sprite, then dev server (Turbopack) on :3000
pnpm build                            # production build — pinned to webpack (`next build --webpack`)
pnpm typecheck                        # tsc --noEmit
pnpm cache                            # measure .next build caches; says what is safe to prune
pnpm cache:clean                      # prune them — never a store a live dev server is holding
NEXT_DEV_DISK_CACHE=0 pnpm dev        # no turbopack disk store at all (slower cold start)
pnpm lint                             # biome check          (lint:fix = --write)
pnpm lint:rtl                         # scripts/check-rtl-classes.sh — fails on pl/pr/ml/mr, left-/right-
pnpm lint:links                       # scripts/check-internal-links.mjs — bare <a> on an internal route
pnpm lint:testids                     # data-testid grammar + catalog drift (scripts/check-testids.mjs)
pnpm testids                          # regenerate the committed testids/ catalog for QC
pnpm test                             # vitest run (src/**/*.{test,spec}.{ts,tsx})
pnpm test src/shared/lib/storage.test.ts   # single file
pnpm vitest run -t 'migrates legacy'  # single test by name
pnpm test:watch
pnpm test:e2e                         # playwright (config + `e2e/`; builds first, so it is slow)
pnpm art:audit                        # measure every CDN image src/ points at; fails if over budget
pnpm art                              # = art:cdn + art:gift-code + art:star-transfer
pnpm art:payment                      # GIF → WebP/h264. Needs `ffmpeg`, so deliberately NOT in `pnpm art`
pnpm icons                            # sprite subset + name types (after editing design-system/tevi-icons*.svg)
pnpm brand                            # favicon + PWA icons       (after editing tevi-logo.svg)
pnpm fonts                            # Chella → WOFF2            (after Brand ships a new TTF)
pnpm format                           # biome format --write
```

`pnpm typecheck && pnpm lint && pnpm lint:rtl && pnpm lint:links && pnpm lint:testids` is the
pre-PR gate (see `.github/pull_request_template.md`).

## `docs/` — the thirteen long-form documents

Each one holds the reasoning a code comment has no room for. Read the relevant one **before**
changing the area it covers; several exist because a "simplification" was tried and reverted.

| Doc | Read it when |
|---|---|
| [`DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md) | before calling any UI feature done — also the reviewer's checklist |
| [`DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | tokens, typography, icons, brand assets, the generated-but-committed pipeline — and §10, carousel vs scrolling row |
| [`STATIC_ASSETS.md`](docs/STATIC_ASSETS.md) | any illustration or image — the no-CDN rule and the art scripts |
| [`TEST_IDS.md`](docs/TEST_IDS.md) | adding `data-testid`; the generated list is `testids/CATALOG.md` |
| [`WEBVIEW.md`](docs/WEBVIEW.md) | anything under `/app/*`, including the native JS bridge |
| [`MINI_APP.md`](docs/MINI_APP.md) | the third-party `postMessage` player and its security posture |
| [`PAYMENT.md`](docs/PAYMENT.md) | Stripe, checkout, saved cards — the four `action` branches, and what is still unbuilt (§8) |
| [`POST.md`](docs/POST.md) | the post card, post page, paywall and paid interaction, replies, composer, bookmarks, collections |
| [`MESSAGE.md`](docs/MESSAGE.md) | direct messages — the inbox, a conversation, the socket frames, sending offline, the floating window |
| [`END_RAIL_OPEN_ITEMS.md`](docs/END_RAIL_OPEN_ITEMS.md) | the desktop end rail / campaign — what is deliberately unfinished (R1–R9) |
| [`EVENT.md`](docs/EVENT.md) | the event area — its **three** screens (My event · Live details · Live studio, legacy's own vocabulary), the divergences, and what the player brings |
| [`API_ERRORS.md`](docs/API_ERRORS.md) | wording any failed write — the API's own message wins, ours is the fallback |
| [`BACKEND_QUESTIONS.md`](docs/BACKEND_QUESTIONS.md) | before "fixing" a payload that looks odd — several look odd on purpose |

## Architecture — feature-first / modular

```
src/
  app/        routing only (thin). Route groups, error/loading boundaries, SEO routes, providers.
    layout.tsx           the document + `providers.tsx` (base: QueryClient → Theme → Locale)
    session-providers.tsx   Auth → Realtime → Permission → Balance → Payment → MyChannel,
                            plus the dialogs, the splash and `MiniAppHost`
    (web)/      the website. `(web)/layout.tsx` is the one place the session stack is mounted.
      (main)/   the DS shell (navbar / tab bar); `login/`, `signup/`, `dev/` sit beside it.
    add-home-screen/[slug]/   the "add {space} to your home screen" instructions. A **rewrite**
                target: `proxy.ts` sends `/@ada?startapp&addToHomeScreen` here (legacy's URL, so
                shared links keep working) and the route sits outside `(web)`, mounting no session
                and no shell — legacy replaces the whole page too, and our own tab bar would land
                exactly where step 1 says to look. The space's **own PWA manifest** is a route
                beside the space page (`[slug]/manifest.webmanifest`), so installing a space gives
                its name and avatar rather than Tevi's; `shared/config/web-manifest.ts` holds what
                it shares with the site's, and `shared/lib/thumbor.ts` squares the avatar.
    app/        `/app/*` webview screens — no shell and **no session** (below).
    api/        route handlers, and there is deliberately almost nothing here. `client-ip/` is the
                only one: the caller's public IP — which the QR panel prints so the phone can see
                where the session it is approving would come from — and their **country**, which
                preselects the payout billing country (`shared/lib/geo.ts`; normally read during the
                document render in `(web)/layout.tsx`, so this endpoint is only the fallback). Both
                come from headers the caller can send, so both are **display** values — nothing may
                be authorised, priced or hidden on either.
  features/   self-contained modules (auth/{components,hooks,api,store,providers,index.ts}).
  shared/     cross-cutting: ui/ (shadcn), components/, hooks/, lib/, i18n/, config/.
  proxy.ts    Next 16's renamed middleware (`export function proxy`) — legacy URL redirects,
              the `/app/*` webview context, and the CSP + its per-request nonce (both
              below). No auth: that is client-side.
```

**`/app/*` = mobile-app webview screens**, not website pages: no shell, no navigation (the
native chrome is around them), `noindex` + canonical to the public twin, said again as an
`X-Robots-Tag` by `proxy.ts` — and **not** disallowed in `robots.ts`, because a disallowed URL is
never fetched and its `noindex` never read. The app owns their presentation context and sends it on the URL —
`?lang=vi&theme=dark&platform=ios&v=3.14.0` — which `proxy.ts` turns into `x-tevi-webview*`
request headers (stripped from incoming requests first) that `app/layout.tsx` and
`getServerT()` read, so language/direction/theme are right on the first paint. Contract and
parsers live in `shared/config/webview.ts`; full spec in [`docs/WEBVIEW.md`](docs/WEBVIEW.md).
Never pass auth in those params — the webview is same-origin and already shares the token
store. Some `/app/*` screens do not read that store at all: on those the **native host owns the
session**, and the page asks it for the account-scoped parts over the JS bridge
(`shared/lib/native-bridge.ts`) — see the note under the primitives below.

**A webview mounts no session.** `/app/*` gets the base providers only; `SessionProviders`
(auth → balance → my-channel + dialogs + splash) is mounted by `(web)/layout.tsx`, so the
website has it and the webview does not. It was in the root layout, which meant `/app/privacy`
— a static legal document — ran the whole bootstrap: a device fingerprint, `/me`, and on a cold
device a Firebase anonymous sign-in plus `v1/connect/anonymous`. A webview screen that really
needs the account mounts `<SessionProviders showSplash={false}>` in **its own** sub-layout
(`app/app/<screen>/layout.tsx`), never for the namespace. The session stack cannot instead be
mounted per top-level route: sibling layouts unmount on a client-side navigation, so `/login` →
`/` would tear down `AuthProvider` and bootstrap twice — it needs one common ancestor.

**Boundary rules (enforce):**
- A feature must NOT import another feature's internals — only via a barrel. `index.ts` is the
  main one; **five narrower barrels at the feature root are sanctioned**, each so a cheap consumer
  does not pay for the whole feature:
  - `routes.ts` — the feature's paths and nothing else, **with no imports of its own** (14 features
    today; the count of *call sites* was written down here as 62 and measures 34, so it is gone —
    a number in prose rots, and `grep "@features/.*/routes"` is the answer that cannot).
    `features/navigation/lib/menu-rows.ts` is a data module with no JSX
    or hooks; routed through `index.ts` its link would close a cycle between two barrels, which ESM
    resolves by handing one side a half-initialised module — not a build error, an `undefined is not
    a function` at render time. So: `@features/payment/routes`, never `@features/payment`. A
    `lib/routes.ts` inside the feature only re-exports it.
    `features/channel/routes.ts` carries one thing more, for the same reason: the space page's
    **deep-link vocabulary** (`direct_donation`, `become_a_member`, `custom_profile`) and the parser
    that reads it off a URL. `features/donation` and `features/membership` both need it, and the
    main barrel would close a cycle through `channel-viewer-actions.tsx`.
  - `skeleton.ts` — the container/shell constants a route's `loading.tsx` needs (9 features), so a
    skeleton does not drag the feature's component tree into the loading chunk.
  - `dev.ts` — fixtures and pieces for the `/dev/*` harnesses (11 features), kept out of `index.ts`
    so production never imports them.
  - `server.ts` — the RSC-only barrel (`features/channel`, `features/event`), carrying
    `server-only`. `features/event`'s also carries the pure SEO builders, whose only consumer is
    that route's `generateMetadata` — a metadata function reaching through the main barrel would
    pull the feature's whole `'use client'` tree, plus `@features/membership` and `@features/share`
    behind it, into a function that returns a `<head>`.
  - **`access.ts`** — `features/event`'s, and the fifth kind: **a product rule two features share.**
    Is a live stream gated, how does it say so, and may the website play it. `features/event`
    renders the stream's page; `features/channel` renders the three surfaces that *advertise* one
    (the Live tab card, the Live-now strip, the Following row) and draws the same badge. Two copies
    of a predicate that decides whether somebody is asked for money diverge silently, and the
    visible half is a price tag printed over a free stream — the bug its own doc records. It takes
    **structural parameters rather than a DTO**, which is what lets one rule serve two services'
    schemas and makes a renamed field a type error at each call site. Import-free for the same
    reason `routes.ts` is: `features/channel` must be able to read it without pulling a barrel that
    reaches back.
  An import that skips `index.ts` for one of those five is **correct — do not "fix" it**. Reaching
  into `components/`, `hooks/`, `lib/` or `api/` is the violation.
- `shared/` must NOT import from `features/`. `app/` composes, holds no business logic.
- Aliases: `@/*`, `@app/*`, `@features/*`, `@shared/*`.
- The `shared/` → `features/` boundary is kept by **`api/request-context.ts`**: a mutable module
  holding device-fingerprint + Turnstile tokens that the auth feature *pushes into* and the axios
  client *reads from*. Any future "shared infra needs feature data" case follows this pattern
  rather than an import.

## Three communication primitives (do not mix)

1. **TanStack Query** — server-state sync. `invalidateQueries` / optimistic mutations. DEFAULT for
   anything backed by the API. Never mirror server data into Zustand.
2. **Event bus** (`@shared/lib/event-bus`, mitt, typed `AppEvents`) — imperative UI-only signals.
   Eight today: five auth (`auth:turnstile-passed`, `auth:signed-in|out`, `auth:session-expired`,
   `auth:accounts-synced`), `balance:star-changed` (the **delta**, for a flash — never the balance,
   and never accumulated into one), `payment:succeeded`, and `payment:star-purchase-requested` —
   the one place an event stands in for an import, because `balance` → `payment` would close a
   barrel cycle; its `ack` is how the emitter learns whether anything was listening at all (on a
   `/app/*` screen, nothing is). NEVER to sync server data. **Every declared event must have an
   emitter** — add one when the thing that fires it exists, not in anticipation. Each event's own
   reason is written at its declaration; read that before adding a ninth.
3. **Socket** (socket.io) — three rooms, scoped to an **account**, a **device** and a
   **broadcast**. Transport for all three is `shared/lib/socket/` (injected `io`, so it is testable
   without a browser) behind a dynamic import, because a guest must never download 40KB to be told
   nothing.
   - The **user room** (`shared/lib/socket/user-room.ts`, connected by `@features/realtime`),
     `${DOORMAN}/user` at path `/doorman/`: this account's balance, Premium state,
     `inbox_change` and the six direct-message frames (`features/message`). Open **only for a real account** — every visitor carries
     an anonymous session, so without that gate the app holds a websocket per guest. Lives for the
     session, pinned to the account, re-pinned on a switch. Subscribe with
     `useSocketEvent(name, handler)`.
     **A socket event is a signal, never a source**: invalidate the query that owns the data, never
     write the payload into the cache — a frame has no ordering guarantee against the HTTP responses
     beside it, so trusting it can move a figure backwards.
   - The **device room** (`shared/lib/socket/device-room.ts`, consumed only by `features/auth`'s
     `use-qr-sign-in.ts`), `${DOORMAN}/device`: open only while the QR
     panel is, presents **no bearer** (the visitor is signed out — that is the point), and joins one
     `ws_channel` the API minted. It is the one place the rule above inverts, and only because the
     payload *is* a session the client has no other way to obtain — see `device-room.ts`. It is
     deliberately not in `features/realtime`: that feature's whole job is "who has an account", and
     this room exists for people who do not.
   - The **live room** (`shared/lib/socket/live-room.ts`, connected by `features/event`'s
     `use-live-room.ts`), `${DOORMAN}/event`: chat, gifts, CCU, the seat layout, and the two
     refusals nothing else can raise — **kickout** and **ban**, which `lib/watch-state.ts` records
     as unknowable precisely because this room had not been ported. Scoped to one broadcast, open
     only while the studio is on screen, real accounts only. It is the one room with **commands**
     (`request(command, payload)` → a promise that rejects on a non-zero `err_code`), and the one
     place where a frame *is* the source: `get_message_history` is a socket command, so the chat
     transcript has no HTTP copy. `join_event` fires on **every** connect, not once — socket.io
     reconnects transparently and the server's room membership does not survive it, which is the
     bug legacy has.
   No room is exported. A second caller of `connect` is a second lifecycle, and they will
   disagree.

**Two further channels exist, and neither is a primitive you choose.** Both are contracts this app
did not design — a shipped iOS and Android build already match on every action string, so nothing in
either may be invented here:

- **The native bridge** (`shared/lib/native-bridge.ts`) — how a `/app/*` screen talks to the
  WKWebView / Android WebView hosting it. Out via `TeviJSInterface`, in via a `window.TeviJS` global
  this module installs on first use (bundled, so the CSP nonce already covers it — legacy injects a
  `<script>` that can fail to load). Replies are correlated **by action name**: the protocol carries
  no request id, so a second call while one is in flight is **refused** rather than handed another
  request's answer, and everything that can hang times out. Contract in
  [`docs/WEBVIEW.md`](docs/WEBVIEW.md); the membership-checkout path in
  [`docs/PAYMENT.md`](docs/PAYMENT.md).
- **The mini-app `postMessage` bridge** (`features/mini-app/lib/protocol.ts`) — the same shape in the
  other direction, for third-party apps framed inside Tevi. See Mini apps below and
  [`docs/MINI_APP.md`](docs/MINI_APP.md).

## API layer (`shared/lib/api/`)

- `client.ts` — the browser axios instance. Request: device-id + Turnstile headers, Bearer auth with
  **proactive refresh** (5s skew), **ETag** `If-None-Match`, **HMAC WebCrypto signing**
  (`interceptors/sign.ts`, appends `?verify=`). Response: **envelope unwrap** (backend returns
  `{ data: payload }` → models see flat DTOs), ETag store, **304 → replay cached body as 200** (or
  re-ask unconditionally if the body is gone), **single-flight 401 refresh, one flight per
  account**, retry ×2 on 5xx/429/network.
  **Retry is limited to idempotent methods** (GET/HEAD/OPTIONS/PUT/DELETE) — plus any method on a
  429, which means the server refused rather than ran the request. A POST/PATCH is replayed only
  with `{ retry: true }`, and only if the backend deduplicates it: a 502 can arrive *after* the
  write landed. Never retries an **aborted** request. A bare `refreshClient` avoids recursion.
  A refresh that fails drops **only** that account (`handleDeadAccount`) — with its ETag scope,
  without promoting another account, and **without any redirect**: it emits `auth:session-expired`
  and `AuthProvider` clears the query cache and drops to anonymous in place. A *background*
  account dying is silent. Screens gate the **action** (`useRequireAuth`), never the route.
  **Credentials (bearer, device-id, Turnstile) go only to W_API** — `origins.ts` matches the parsed
  origin, never a string prefix. `apiClient` is shared, so any other absolute URL is unauthenticated.
- `token.ts` — multi-account store (max 10 → `MaxAccountsError`), `useSyncExternalStore`
  (`subscribe`/`getSnapshot`/`getServerSnapshot` → empty on server), lazy `hydrate()`.
  **localStorage-only** (accepts the XSS trade-off — backend auths via the Authorization header,
  not cookies). No SSR bearer. Follows other tabs via the `storage` event → `syncFromStorage()` +
  `auth:accounts-synced` on the bus (AuthProvider re-syncs the rendered session).
- `model.ts` — `createApiModel({ apiBase })`; strips empty params, returns `r.data`. Two-file
  pattern: build the model, then a domain file composes methods (see `features/auth/api/auth-api.ts`).
- `paged-list.ts` + `page-cursor.ts` — **the paging rules, written once**, for every page-numbered
  DRF list (blocked accounts, follow requests, following, the notification inbox): the params for
  the next page, and taking one row out of an `InfiniteData` without a refetch. Both of those fail
  *quietly* — a stop condition that never fires shows a list re-requesting its last page forever, a
  removal that misses shows a row the server no longer has with a button that 404s, and neither
  throws. Page size, endpoint and row type stay in each feature's own `*-page.ts`. The
  **cursor**-paginated threads list is deliberately not folded in.
- `upload-api.ts` — the shared media-upload path. `server-query-client.ts` — the per-request
  QueryClient for RSC prefetch; never the browser's.
- `server-client.ts` — `createServerApiModel` for RSC. **Public content only** (no bearer exists
  server-side), HMAC-signed, 10s timeout so a silent upstream can't hold a render. GETs are
  `no-store` unless the model (or the call) opts into ISR with `revalidate` seconds — do that for
  anything public and slow-changing rather than paying W_API latency on every render.
  **Every server read of metadata goes to the in-cluster services** — `internalApiBase(service)`
  in `shared/config/server-env.ts`, defaulting to legacy's three hosts (`tevi-channel` for spaces,
  `tevi-post` for posts and the home feed, `tevi-livestream` at prefix `live` for events), which need
  no credentials. The service matters and fails quietly: a post asked of the channel service is a
  404 rendered as "deleted". That origin is *not* `NEXT_PUBLIC_W_API_DOMAIN`, so `isApiUrl()` is
  false for it: signing is skipped (correct — `?verify=` means nothing inside the cluster), but
  envelope unwrapping is gated on the same predicate and the internal service *does* wrap, so such a
  model must pass `unwrapEnvelope: true`. A machine **outside** the cluster — `pnpm dev`, the CI e2e
  job — sets `SERVER_API_VIA_GATEWAY=1` and the same reads go through the public gateway instead.
- `query-client.ts` — 60s `staleTime`, no refetch-on-focus, never retries 4xx, opt-in error toasts
  via `meta.showErrorToast`. **On a failed write (POST/PUT/PATCH/DELETE) with a 4xx, the API's own
  message wins and our string is the fallback** — the backend is the only party that knows why *that*
  write was refused. Three things make that safe. "The API's message" is the **response body**
  (`message → data.message → detail → error`, ≤200 chars), never `ApiError.message`, whose fallback
  chain ends in axios's own English — and the field spellings are a *union* across **five** existing copies of the
  predicate, because only `payout-request-errors.ts` reads `detail` and only `use-create-channel.ts`
  reads `errors[0].error`, so a helper that misses either fails **silently**.
  **5xx, 429 and 403 are skipped** (nobody phrases a server fault for a user; a throttle's text is
  often the proxy's, and `Retry-After` is already parsed; a 403 is `features/permission`'s
  vocabulary), as is any read failure. And a body that names **fields** goes inline under those
  fields with **no** toast — which is why `use-save-profile.ts` / `use-update-privacy.ts` set no
  `meta` at all. Hence `mutationMeta.showErrorToast` is typed `string`, not `boolean | string`:
  `true` means "print `error.message`", which is exactly the leak. Two anti-enumeration exceptions
  stand (the email sign-in form, chiefly). Full rule, the four-copy migration and **B90**:
  [`docs/API_ERRORS.md`](docs/API_ERRORS.md).
- `errors.ts` — `ApiError` (`status`, `isNetwork`, `isCanceled`, `isAuthError()`); everything rejects
  normalized.
- `unwrap.ts` / `origins.ts` — the two rules both clients share: envelope unwrapping and which host
  may receive credentials. Kept axios-free so `server-client.ts` can use them. Unwrapping is
  **scoped to W_API** (`unwrapApiEnvelope`) — only Tevi wraps in `{ data }`; another host's `data`
  field is its own payload.
- `interceptors/etag.ts` — two tiers: an LRU `Map` (1000 entries) in front of IndexedDB
  (`tevi-etag` v4, store `etags`, key `<accountId>::<origin><path>?<sorted params>`).
  **The disk tier is opt-in and the memory tier is not**: every GET with an `ETag` is held in
  memory for the life of the tab, and only a call passing `cache: { persist: true, ttlMs }` is also
  written to disk. Set it for content that is **public and slow-changing** and never for anything
  account-scoped — it used to be the default, which left per-account billing bodies (`my-subscriptions/`,
  **B72**) in the profile of a shared device for 24h. `CACHE_TTL` offers the only two TTLs worth
  having: `day` for a catalogue a human edits, `hour` for a rate or a config blob. Read the wire
  payload before deciding "public" — `inbox-types/` carries `turn_on` and `campaigns/` carries
  `user_joined`, so both read like catalogues and are neither.
  The gate is **symmetric** (`getStoredEtag` and `getCachedData` both check it), so removing
  `persist` from an endpoint stops serving its old disk records the moment the code ships.
  `cache: { shared: true }` is a **second, separate** flag: it files the body under one device-wide
  scope (`SHARED_SCOPE`) instead of the account's, so one copy serves every account — set it only
  where the response does not vary by **bearer** (params are already in the key, so per-country is
  fine). It is deliberately not implied by `persist`: the account scope is the second line of
  defence, and a body wrongly marked public is a copy on disk today but one reader seeing another's
  body if the scope collapses too. `clearETagScope` does not reach a shared record.
  The **query** layer has to agree, and did not: a long `staleTime` with the default 5-minute
  `gcTime` is not a long cache — the data is collected five minutes after the last reader unmounts
  and the next visit refetches in full. Use `keepFor(ms)` (`query-client.ts`) to set both.
  A validator is never stored without its body, so a 304 this client asked for can always be
  answered; the three races that can still separate them (memory trimmed, record expired, scope
  changed) re-ask unconditionally rather than surfacing an empty success.
  **One shared connection** per page; expired records pruned once on idle; deletes by key range,
  not a full key scan; writes funnel through `idbWrite` so a failure can never reach the page and
  `QuotaExceededError` drops the cache instead of failing forever. Bodies over **256KB are not
  cached at all** (neither tier). Bump `DB_VERSION` to discard the store — a cache is rebuilt,
  never migrated. Every path degrades to memory-only when IndexedDB is missing or blocked.
  `invalidateETagCache` is **async and must be awaited before the refetch it precedes** — it drops
  both tiers, and without params it drops every query variant of the path (a prefix, bounded by the
  `?` `generateCacheKey` always appends, which is what keeps `my-channel/` off `my-channel/threads/`).
- `shared/lib/locks.ts` — `withLock` over the Web Locks API (no-op fallback where unsupported). Work
  that must happen once per **device**, not once per tab: token refresh (`LOCKS.refresh(id)`) and
  minting the anonymous session (`LOCKS.anonymous`, via `AuthProvider.ensureAnonymousSession`).
  Both re-read the store inside the lock and bail out if another tab already did the work.

Never call axios directly from components — go through a model + a query hook. That holds for
imperative paths too: `AuthProvider.refreshUser` fetches `/me` via `queryClient.fetchQuery` with
`authKeys.me(accountId)`, so its six callers collapse into one request instead of racing, and a
dead session can actually evict it. Query keys live next to their model (`api/auth-api.ts`).

## Remote config (`shared/lib/remote-config/`)

Firebase Remote Config — **platform** configuration the team changes without a deploy (prices,
limits, store links, kill switches), the same values for everybody. Not to be confused with
`features/permission`, which is *per-account* entitlement, nor with the unrelated
`permission/v3/remote-config/ACTION_FEE/` HTTP endpoint.

- `useWebConfig()` for the common case, `useRemoteConfig()` for `isKnown` / `refresh` / the other
  two parameters. **No provider**: one query key does the deduplication a provider would, and a
  page that reads no config pays nothing — no Firebase chunk, no request, which is what keeps it
  out of `/app/*` webviews.
- **Nothing is ever null unless the type says so.** Every field has a fallback in code, chosen per
  field: flags fail *closed*, limits fail to the number legacy hard-codes, links fail to the real
  store URL. So call sites read `config.post.createPost.characterLimit` with no `?.` and no
  `?? 500`. `WEB_CONFIG_DEFAULTS` is *derived* from the schema — never write a second literal.
  Where "unconfigured" has to stay visible the type carries it instead of a flag:
  `interaction.billing` prices, `video.resolutionMax` and `defaultCountry` are `null`.
- **One fetch, all three parameters** (`WEB_CONFIG`, `THIRD_PARTY_CONFIG`, `DEFAULT_EVENT_CONFIG`).
  Remote Config downloads the whole template in one request, so a per-parameter getter buys
  nothing; legacy has five and fires the same payload up to three times.
- `fetchConfig` and `activate` are **separate** calls: a throttled or offline fetch still activates
  the last template from IndexedDB instead of dropping to code defaults. Reading Firebase never
  rejects — failure resolves to the defaults with `isRemote: false`, and `isKnown` is how a screen
  that must not print a made-up price tells the difference — but `isKnown` is a *transport*
  signal ("Firebase answered"), not a per-field one; a field that must show its own absence is
  nullable, per the point above.
- It lives in `shared/` and not `features/` because it depends on no feature and `shared/`
  components read it (`get-app-dialog.tsx` takes the store links). Think of it as `config/env.ts`
  for values that change at runtime.
- `selectors.ts` holds the pure resolvers — Datadog audience precedence
  (`user → device → paid user → country → default`) and the per-country sustained-fee rule. Three
  of legacy's Datadog bugs are fixed there and pinned by tests; read the comments before
  "simplifying" the precedence chain.

## Storage (`shared/lib/storage.ts`)

SSR-safe wrapper (`storage.get/set/remove/getJSON/setJSON`) — all calls swallow quota/disabled-storage
errors. Every persisted key is declared once in `STORAGE_KEYS`, namespaced `tevi.<domain>.<name>`.
`migrateLegacyStorage()` runs at client import (flag-guarded, idempotent, never throws) and must
happen before any store hydrates. Never touch `localStorage` directly. A key scoped to an account
also needs a line in `forgetAccount` (see Auth) — `STORAGE_KEYS` says where it is written, not who
is responsible for removing it.

## Money (`shared/lib/money.ts`)

Three tiers, and collapsing them is the mistake to avoid.

- **`shared/lib/money.ts`** — pure formatters over a number and a `Currency` record. Shared because
  three features render figures (`balance` in the shell, `my-wallet` in the reader's chosen
  currency, `my-star` a Star count) and none of them owns the arithmetic; putting it in any one
  would make the other two depend on it for something that is not its business.
- **`features/balance`'s `formatLedgerAmount`** — the only thing that knows what `TVS` and `TEVI`
  mean. Deciding a row is Star rather than money is a product fact, not a formatting one, so that
  vocabulary stays out of `shared/`.
- **`features/earnings/lib/format.ts`** — deliberately separate and still pinned to USD; that is
  **B29** in [`docs/BACKEND_QUESTIONS.md`](docs/BACKEND_QUESTIONS.md). When the question is
  answered it becomes a caller of `money.ts` rather than staying a fourth copy.

## Security headers (`shared/config/csp.ts`)

**The CSP is the compensating control for keeping tokens in `localStorage`.** That trade (see
`api/token.ts`) gives up what an httpOnly cookie would buy, on the grounds that the backend
authenticates via the `Authorization` header — which only holds if script injection is hard in the
first place, and that is this file's job. Without it, one injected `<script>` reads every account's
refresh token.

- **Nonce + `'strict-dynamic'`, not a host allowlist.** Only scripts carrying the request's nonce
  run, plus whatever those scripts go on to load. So a third-party script injected by `next/script`
  (Google Identity, Turnstile) needs **no `script-src` entry** at all — what it needs is
  `frame-src`, because it renders its UI in an iframe. Adding an SDK: look at `frame-src` /
  `connect-src` / `img-src` first, and reach for `script-src` last.
- **There is deliberately no `https:` fallback.** It only ever helped CSP2-only browsers, and it
  handed them "any HTTPS host may serve script" — the exact hole this file exists to close.
- **The nonce goes on the request headers too**, not only the response (`proxy.ts`). Next reads it
  back out to stamp its own bootstrap, flight data and chunk tags; set it on the response alone and
  the page renders and then does nothing.
- `style-src 'unsafe-inline'` stays: React writes `style={{…}}` as an attribute and Next inlines
  critical CSS, and nonces cannot cover attributes. Injected CSS is a far smaller prize than
  injected script, and script is locked down.
- `CSP_REPORT_ONLY` ships as a **second header**, requiring Trusted Types on the DOM sinks that can
  execute script. Report-only on purpose — the app is starting to render HTML it did not author, and
  the point is to find out what would break before anything is enforced.

A blank page after adding a script, a frame or an image host is this file, not the feature.

## Auth (`features/auth/`)

Firebase is used for the anonymous session and for nothing else *in auth* — the SDK's other consumer
is Remote Config (above) — and is lazily dynamic-imported to stay out of the initial bundle;
everything else is custom JWT against `${W_API}/auth`. The app always keeps a
session: on bootstrap it either `refreshUser()`s an existing token or creates an anonymous one, and
`signOut()` re-establishes anonymous. After a real sign-in, leftover anon accounts are purged.

`useAuth()` → `{ currentUser, isAuthenticated, isAnonymous, isBootstrapping, isSigningIn,
isSigningOut, accounts, activeId, turnstileSiteKey, turnstileNonce, signInErrorKey, signInErrorText,
loginMethod, signInWithAnonymous, signInWithProvider, signInWithEmail, signInWithQrSession, signOut,
switchAccount, removeAccount, refreshUser }`. `signInWith*` route through `runSignIn`, which treats
**HTTP 406 as "Cloudflare Turnstile challenge required"** → fetches the site key into the store
instead of throwing.

**QR sign-in is the one that does not make a request.** `POST v1/device-links/` mints a token, the
browser draws it, and the *phone* redeems it — the session comes back over the device room (see
primitive 3) already minted, so `signInWithQrSession` hands `runSignIn` a call that has already
happened. It goes through `runSignIn` anyway rather than around it: the account limit, the token
store, `/me` and `auth:signed-in` are the same on every path, and a ninth way in that reimplements
them is a ninth place for the tenth account to slip through. Contract questions are B80 in
[`docs/BACKEND_QUESTIONS.md`](docs/BACKEND_QUESTIONS.md).

**Each of the three primitives owns one thing, and nothing is owned twice:**
- `currentUser` is `useQuery(authKeys.me(activeId))` — server state, so TanStack Query. Keyed on
  the active account, which is why switching accounts (in this tab or another) refetches on its
  own and why signing out needs no explicit clearing: no account, no data.
- tokens + the account list live in `shared/lib/api/token.ts` (`useSyncExternalStore`).
- Zustand (`auth-store.ts`) holds **only** UI state: the three loading flags, `turnstileSiteKey` /
  `turnstileNonce`, `loginMethod`, `signInErrorKey` / `signInErrorText`, `isLoginDialogOpen`. It used to mirror
  `currentUser` too — the same `/me` body in three stores, each sign-out and expiry having to
  update all three by hand. Don't put server data back in it.

Three loading flags, not one: `isBootstrapping` (the one-time session bootstrap), `isSigningIn`
(including a Turnstile replay) and `isSigningOut`. `signOut` used to set nothing, so every caller
invented its own `useState`.

`signInErrorKey` is a **translation key**, scoped to sign-in — the only auth operation with a form
waiting to be told. Produced by `toSignInErrorKey` (`lib/auth-error.ts`), which never lets the
backend's own message reach the screen and maps 400 and 401 to the same key so the form cannot be
used to enumerate accounts. **One scoped exception:** a *provider* failure (`v1/connect/*`, so
never the email form) also sets `signInErrorText` — the sentence its 4xx **body** carried, shown
in place of the key, because no key of ours can say "Please use a different Google account".
`providerSignInErrorText` gates it: body only (never `error.message`, which falls back to axios's
own wording), 4xx only (a 5xx body is where stack fragments live), one short sentence or nothing.
It is untranslated by nature. Don't widen it to the email form — the 400/401 collapse there is
the anti-enumeration measure.

**Two-step verification is a second model, not part of `authApi`** (`api/two-fa-api.ts`). The account
passcode that stands in front of a withdrawal: `/me`'s `two_fa_passcode` says the account has one
(`accountTwoFaPasscode`), `TwoStepVerificationDialog` collects it, and the code is both verified
(`POST v1/two-fa/passcode/verify/`) **and attached to the write** — legacy sends both, and the write
is what the backend enforces. The dialog lives here rather than in `features/payout` because a
passcode is a credential and the six boxes already exist (`OtpInput`); it is exported from the barrel
as a *component*, so no consumer can assemble a shabbier version from the endpoint. *Forgot
passcode?* runs the recovery chain in the same dialog — `recover/` (which answers with the address it
mailed, so the step names the inbox) → `reset/verify-otp/` → `reset/`, five steps behind `useTwoFaFlow`, which is a hook because every claim worth pinning there is a
**sequence**: the emailed OTP authorises a write three screens later, a passcode mismatch costs no
request, and a finished reset returns to *Enter passcode* rather than to `onVerified` (`reset/` is not
a verification, so handing its passcode straight to a withdrawal would attach a code `verify/` never
checked). **All eight of legacy's endpoints are implemented**, in two halves with different callers: `verify/`
plus the recovery chain *present or recover* a passcode (the withdrawal path), and
`GET`/`POST`/`PATCH`/`DELETE v1/two-fa/passcode/` *manage* one — which is
**`/settings/two-step-verification`** (`TwoFaSettings`, reached from the drawer's Privacy and
Security). Only the screen is exported, never the model or its three flow hooks.

That screen is a **1:1 port of the Figma page `Two-step verification`** (file `Tevi Web - Version
2.0`), and three of its decisions come from the comps rather than from this repo's usual defaults:

- **The route is gated, not the actions.** With the factor on, the page opens on *Enter passcode*
  (`TwoFaGate`, a page view over the same `useTwoFaFlow` the dialog drives, recovery chain included)
  and the three management rows appear only behind it. `CLAUDE.md`'s "gate the action, never the
  route" is about **sessions**; this is a re-auth on a page whose entire content is controls for a
  credential. It is also what makes `DELETE` safe — it carries no body, so "you must know the
  passcode to remove your second factor" is a guarantee the *client* makes.
- **One back control, in the bar, and it walks the flows.** All three machines are therefore mounted
  in `TwoFaSettings`. The bar is `TwoFaBackBar` and not `PageBackBar` because `features/navigation`
  imports `features/auth`, so the reverse would close a barrel cycle.
- **Changing a passcode ends on a hint step** (new → re-enter → hint, *Skip* posting `''`), which is
  what settles whether `PATCH` needs `passcode_hint`: the reader always chooses it.

All three management actions are built. *Change recovery email* goes through a **second family at
the auth root** — `POST v1/recovery-email/verify/` then `PATCH v1/recovery-email/` — not through
`two-fa/` at all, which is why guessing cost three wrong shapes before the auth contract settled it
(**B92** keeps the table). The same OTP is what `POST two-fa/passcode/` redeems, so setup and
change send the code the same way. Three contract facts that bite: `DELETE` takes **`{ passcode }`**
(legacy sends no body), `GET` answers **`422 AU002`** when no passcode is set and returns the
recovery address **masked** — so it may be shown and never compared, and never pre-filled into an
editable field — and `POST two-fa/passcode/` answers **`422 AU001`** for an account that already has
one, so it is strictly first setup.

What made those findable was letting the **API's own message** reach the screen on a 4xx
([`API_ERRORS.md`](docs/API_ERRORS.md), `twoFaWriteErrorText`). Without it the first real refusal —
`{ code: "validation_error", message: "Passcode must be 6 digits" }` — surfaced as our generic
"couldn't update your recovery email", the one sentence that could not diagnose it. The sign-in
exception to that rule is about **enumeration**, and does not reach a settings write.

The intro/success **illustration** is the one asset in this repo that did not come off the CDN
(`TWO_FA_ART` in `features/auth/lib/illustrations.ts`). It exists only as an image layer in the design
file, so it was rendered through Figma's image endpoint at 2× its 190×127 box and encoded WebP at
`build-cdn-art.mjs`'s own quality. It is **not** a `SOURCES` row on purpose: that script fetches URLs
and a Figma render URL expires in 30 days, so the node id is the traceable source instead.

**The step marks are the comps' own glyphs**: every passcode step draws a key and both email steps
an envelope, both from the Figma library since the full import of 2026-10-08 (`envelope` had come
from upstream Zappicon through the overlay before that). Figma ships the key as **`key-message`** —
a plain key in all five weights — and `scripts/import-figma-icons.mjs` renames it `key`. The `MARKS`
tables hand the name to `<Icon weight="filled">` at runtime, so `key--filled` sits in
`build-icon-sprite.mjs`'s KEEP list; drop it and every passcode step draws an empty disc.

The management half is the **guessed** half generally (nothing had ever called those four, and
`two-fa/` is in no schema): its open contract questions are **B92**.
The server, not the flag, is the gate: `payoutRequestOutcome`'s `passcode-required` raises the same
step when `/me` was stale, which is why the flag defaults to **off** rather than fail-closed —
defaulting to on would prompt every account that has never set one, with nothing they could type.

**`forgetAccount` is the one place an account's traces are erased** — its bearer, its ETag scope,
its cached `/me`, and every piece of per-account state this device holds: sensitive-content consent
(`shared/lib/nsfw-consent.ts`), the 18+ confirmations an account gave for individual live events
(`shared/lib/age-consent.ts`), search history (`shared/lib/search-recents.ts`), and whatever comes
next — and it **revokes server-side first** (`authApi.logout(id)` while the refresh token still
exists to renew with), then removes locally. That is *why* those stores live in `shared/lib/` and
not in the feature that reads them: `features/auth` may not import another feature, so anything
`forgetAccount` has to drop must sit below it. Consent began in `features/channel` and therefore survived the account that gave it —
readable by whoever used the browser next. **Adding a new kind of per-account device state means
adding its teardown here**; miss it and nothing fails, the data simply stays.

HMAC secret (`NEXT_PUBLIC_SIGN_SECRET`) is intentionally client-side (public secret, matches legacy).
It signs `pathname + unixSeconds` only — not the method, query or body — so `?verify=` is a
bot speed bump, **not an integrity control**. Don't describe it as one.

Contract questions the client is still guessing at live in
[`docs/BACKEND_QUESTIONS.md`](docs/BACKEND_QUESTIONS.md), each with what the code assumes
today and what changes if the answer differs. Read it before "fixing" an auth payload that
looks odd — several of them look odd on purpose.

## Permissions (`features/permission/`)

One endpoint (`permission/v3/channel/permission/`), one question: **which features has the backoffice
switched on for this account.** Not roles, not scopes, not admin rights — and not remote config, which
is platform-wide and a different service (legacy's `ACTION_FEE` call is dead code and is not ported).

The payload is an open-ended bag of grants, each with its own spelling of "yes" (`transfer_star.allowed`
vs `fiat_agency.is_active`). So the wire spelling lives in **one** place — `CAPABILITIES` in
`lib/capabilities.ts` — and the app gates on product names: `can('star-transfer')`,
`can('payout-agency')`. Adding a grant is one line there; because `Capability` is a union, a typo is a
type error rather than a silently-false gate. A grant that ships after this client can be read with
`grant('feature', 'flag')` — the payload is parsed `looseObject` and carried whole.

Two rules, and both are stated once rather than per call site:
- **Gates fail closed.** Unknown ⇒ denied, everywhere. These surfaces move money.
- **A failure is not a denial.** An all-false payload is a *legitimate* answer (an ordinary creator's
  `{}`), so `capabilityState` answers in four states — `loading | error | allowed | denied`. Legacy has
  two and shows an agency "Access denied" forever after one 502. Grants already in hand outrank a
  failed *refetch*, so a blip never takes a working screen away.

`usePermission().can()` for a list (a menu row), `useCapability(c)` for a screen (four states),
`useRequireCapability()` for a press (composes `useRequireAuth`). Never read `permission.raw` from
feature code.

## Mini apps (`features/mini-app/`)

**Third-party web apps framed inside Tevi**, over a `postMessage` bridge this app did not design:
the iOS and Android hosts implement the same contract, so the web player is the *third*
implementation and every action name in `lib/protocol.ts` is a string some shipped app already
sends. Full contract, security posture and the deliberate divergences from legacy:
[`docs/MINI_APP.md`](docs/MINI_APP.md). Open contract questions: **B82**.

Opening one is a single call, and the only supported way in:

```tsx
const { open } = useMiniApp()            // composes useRequireAuth; vets the URL
open({ id, name, url, iconUrl, shareableUrl })
```

The vetted `MiniAppConfig` is constructible only inside `lib/app-config.ts`, so a call site cannot
assemble one and skip `safeExternalUrl` — an `iframe src` is the one sink where `javascript:`
executes as us with no click to intercept.

- **All three primitives, none of them overlapping.** Tabs + window rect are **Zustand** (pure UI
  state; the openers are everywhere and the renderer is one place, so a context would re-render
  every space page whenever a frame finished loading). The per-app token, purchases and deposits are
  **TanStack Query** — the token deduplicates through `fetchQuery`, and every write invalidates
  `balanceKeys.all`. "The reader needs Star" is the **event bus**
  (`payment:star-purchase-requested`), for the same reason `useRequireStars` uses it: the sheet
  lives in `features/payment`, which imports `features/balance`, and calling the other way would
  close a barrel cycle. No socket — a mini app's own realtime traffic is its business.
- **The frame is untrusted, and the rules that make it safe are enumerated in one place**
  (`docs/MINI_APP.md` §6): sandbox without `allow-top-navigation`, `allow-same-origin` dropped for a
  same-origin app, one delegated permission, `no-referrer`, and messages matched on
  `event.source === iframe.contentWindow` rather than origin alone — two tabs of the *same* app
  share an origin, which is how legacy has them cross-answer each other.
- **Options from a frame are parsed by zod and the request body rebuilt field by field**
  (`api/types.ts`). The price an app states is never sent: the backend prices the product, and
  `422 EC0001` is what "not enough Star" means.
- **Every handled action posts exactly one reply**, including failures and unknown actions. Legacy
  leaves four paths silent, and a silent path is an app stuck on its loading screen.
- `MiniAppHost` is mounted by `session-providers.tsx` *inside* `MyChannelProvider` (the bridge sends
  the reader's own slug), renders nothing until an app is opened, and dynamically imports the window
  — so a visit that opens none pays one store subscription. `/app/*` webviews mount no session and
  therefore no player: the native app hosts mini apps itself, through this same bridge.
- **A space that *is* a mini app opens it on arrival** (`useAutoOpenMiniApp`, called by
  `ChannelViewerActions`). Where it is called from is the whole gate: that row renders only when the
  space's actions are offered, so every wall withholds the auto-open for free. A guest is *skipped*
  rather than gated — a page load must never raise a sign-in dialog. The guard remembers **which**
  app was opened, not that one was; legacy's boolean-plus-reset-effect means the second mini-app
  space of a session never opens.
- **The player is `z-40` and the mobile tab bar yields to it.** Every dialog a mini app can raise is
  `z-50`, so the player must be under 50; the tab bar is also `z-50`, so it cannot be over it — no
  number is both, and `TabBarShell` hides the bar via `useMiniAppCoversScreen()` instead. Full
  reasoning on that hook and in `docs/MINI_APP.md` §7a.
- The player is **not a design-system surface** — Figma draws no window chrome. The geometry is
  legacy's; everything that can come from the DS does. Harness: `/dev/mini-app`.

## i18n (`shared/i18n/`)

Self-managed in-repo (no Crowdin): one flat `locales/<lng>/translation.json` per locale, single
`translation` namespace. 9 `SUPPORTED_LOCALES` (incl. `ar` for RTL), 8 surfaced in the switcher
(`UI_LOCALES` / `LANGUAGES`). Locale is resolved server-side in `layout.tsx`
(`?lang=` → cookie `tevi.locale` → `Accept-Language` → `en`) and passed down to `AppProviders`.
`?lang=` is the one place a locale is part of the **address** — `proxy.ts` lifts it into a request
header, so `/premium?lang=vi` always renders Vietnamese whatever the cookie says. That is what
`hreflang` needs (`siteAlternates` in `shared/config/seo.ts`, used only by pages whose content is
translated). The language switcher drops it from the URL, or the URL would outvote the choice.
Client: `useTranslation()` from `@shared/i18n/use-translation` (adds `changeLanguage`, which syncs
storage + cookie + `<html lang|dir>`). RSC: `getServerT()` / `getT(locale)`.

⚠ **That resolution is why every route in this app is dynamically rendered.** `app/layout.tsx`
awaits `cookies()` and `headers()`, which are Dynamic APIs, and a page cannot opt out of its own
root layout.

**Every `notFound()` is a soft 404 — 200 with the not-found body — and the cause is *not* the
above.** It is streaming: `app/loading.tsx` wraps the whole app, so a Suspense fallback goes out
before any page has decided, and the status line goes with it. A `permanentRedirect()` becomes a
meta refresh in a 200 for the same reason. Only an **unmatched** path (`/a/b/c`) gets a real 404,
because Next sets that before any render. This note used to blame the Dynamic APIs; that was
wrong, and a "fix" aimed there changes nothing. It is left alone on purpose — Next adds `noindex`
to a streamed not-found and Google reads a zero-delay refresh as permanent, so for a crawler it
costs nothing, while a real status costs the instant skeleton. `[slug]/page.tsx` has the table and
the two ways out. Also: a `notFound()` branch must return **no** `robots` from `generateMetadata` —
Next emits its own `noindex` on that render, and a second tag beside it is two tags where one is
expected.

**One locale reaches the browser, not nine.** `resources.ts` (all nine, ~820 KB of JSON) is
**server-only**; `client.ts` bundles **English alone** — it is `FALLBACK_LNG`, so it stands behind
any key a locale has not translated. All nine are complete and stay in lockstep (`ar` additionally
carries Arabic plural forms — `_zero`/`_two`/`_few`/`_many`); a new key belongs in every locale, not
only in English. Don't write the key count down here or anywhere else — `resources.test.ts` is what
holds that invariant, and a number in prose only rots.
The request's locale travels as a **prop** from `layout.tsx` (`getLocaleBundle`) through
`LocaleProvider`, so init stays synchronous and the first client render already matches the
server's HTML — no dynamic import to await, no flash of keys, no hydration mismatch. The switcher's
`changeLanguage` is therefore **async**: a third locale is a code-split chunk
(`locale-bundles.ts`). Three silent-failure guards in `resources.test.ts`: English is a superset of
every locale, no client module imports `resources.ts` (the shared type lives in `settings.ts` so
nobody needs to), and every supported locale has a loader.

## Styling

**Source of truth: the Claude Design project "Tevi Design System — Figma 1:1"**
(`5a7f74d2-f2f7-4926-b50d-253edc777ad5`, read it with the `DesignSync` tool), itself ported 1:1
from Figma `WVfz0MwBGyGt67LfNEY2pW`. Token names and values in `globals.css` match its
`colors_and_type.css` **verbatim** so markup copied out of the DS `preview/*.html` renders
correctly. Look a component up in the DS `components.md`, then copy the real markup from
`preview/<name>.html`. Never rename a token or round a value.
Full pipeline + runbook: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

- Semantic tokens only. The Zinc and Primary ramps **invert** between modes (`--zinc-950` is
  `#09090b` light, `#fafafa` dark) — use `--text-title`, never `--zinc-950`, never a raw hex.
  Light is `:root`; dark is `.dark` (next-themes) or `[data-theme='dark']`.
  Custom breakpoints: sm 612 / md 900 / lg 1040 / xl 1440.
- Typography: the 25 `.type-*` utilities (`type-body-default`, `type-title-t2-semibold`, …), one
  per Figma text style. Never set `font-size` / `font-weight` by hand, and don't reintroduce a
  Tailwind `--text-*` size scale — `--text-body` is already a **colour** token.
- ⚠ **Spacing indices differ.** The Figma ramp is not linear: `--spacing-5` is 24px but Tailwind
  `p-5` is 20px. The mapping table is at the top of the spacing block in `globals.css` — from
  step 5 on, use `p-6` / `p-8` / `p-10` / `p-12` / `p-16` / `p-20` / `p-24`.
- Shadows are `shadow-xs…3xl` + `shadow-label`, backed by the mode-aware `--elevation-*` ramp;
  blur is `--blur-sm/md/lg` for `backdrop-filter`. Both flip with the theme.
- Icons: the DS sprite only — `<Icon name="angle-left" size={20} />` from `@shared/ui/icon`.
  Weights are typed per glyph, so an unavailable one is a type error. Never substitute a shape and
  never hand-draw a path. If the glyph you need is missing, say so — and if the screen genuinely
  cannot work without it (a two-state toggle, where one glyph cannot express two states), take it
  from **upstream Zappicon v1.2.0**, the set the Figma library was itself built from, into
  `design-system/tevi-icons.extra.svg`. That overlay is merged by `pnpm icons` and survives a
  Figma re-export; read its header first. Also check the glyph actually *has* the weight you are
  toggling: 67 bare ids are `<use>` aliases onto `--filled`, so `eye` and `eye--filled` are the
  same drawing and a weight toggle on one is a no-op (`sprite-weight-toggle.test.ts` guards it).
  Browse at `/dev/icons` (dev-only).
- Brand: `<Logo size={48} />` from `@shared/ui/logo`. There is **no wordmark** in the DS — the
  "Tevi" lettering is live text in the Chella font, not an asset.
- **No static art is fetched from a CDN.** Every illustration, banner, backdrop and brand mark is
  committed under `public/illustrations/` and produced by `scripts/build-cdn-art.mjs` (one row in
  its `SOURCES`); `pnpm art:audit` fails on any remote image URL in `src/`. A rendering screen
  depends on no other host, and an asset's version is the commit it landed in. This started as a
  byte budget and three things kept slipping through it: `next/image` **passes a remote SVG through
  unprocessed** (`dangerouslyAllowSVG` is permission to serve, not to optimise — `logo-gyf.svg` was
  2.27 MB to fill a 64px tile), a CSS `background-image` is never optimised at all, and *small is
  not local* — the last two offenders were 3 KB each. The one exception is content whose URL the
  backend decides (`socialMarkUrl`, avatars, post media). Guard new art with `committedArt()` from
  `shared/lib/committed-art.ts` in the feature's `illustrations.test.ts`. Runbook + inventory:
  [`docs/STATIC_ASSETS.md`](docs/STATIC_ASSETS.md).
- `design-system/` holds the upstream sprite, logo and brand font. Nothing there is served; it is
  the input to `pnpm icons` (sprite subset + name types), `pnpm brand` (favicon + PWA icons) and
  `pnpm fonts` (Chella → WOFF2), whose outputs are generated-but-committed and guarded by tests. **Read
  [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) before changing any of it** — it covers the
  pipeline, the runbook, and the silent-failure traps (sprite aliases, Tailwind inlining shadow
  values, manifest icons pointing at nothing).
- **Screen surfaces — decide this before writing a screen, not after review.** Below `md` a screen
  paints `--background-surface` **full-bleed** — on `<main>`/the column, on the sticky bar **and** in
  `loading.tsx` — and becomes a card from `md` up. The column carries no padding of its own, and
  filling it is `md:grow`, **never a `min-height`**.
  The **one** case that keeps the page colour is a screen with a plain `--background-surface` card
  floating in its column (`/my-wallet`, `/my-star`): there the gaps between cards *are* the
  separation, so painting the screen dissolves them, and only the bottom-most block takes `fullBleed`.
  Blocks that are tinted, outlined, or full-bleed to the bottom carry their own edges, so a screen
  made only of those is painted whatever its block count (`/monetization/membership`). **A form is
  never the page-colour case** — a screen that is only fields is always painted and full width below
  `md`, with every block full-bleed, `gap-0` + `border-b` in place of the gaps, and the submit as a
  `sticky bottom-0` bar; the double inset it removes is 32 of 390px. Empty states
  follow the panel, with a 16/600 title and a `max-w-[400px]` body.
  The decision table, the reference pairs and the traps — a skeleton block that goes *invisible* on
  the surface rather than merely mismatched, and `overflow-clip` vs `overflow-hidden` under a sticky
  header: [`docs/DESIGN_SYSTEM.md` §6](docs/DESIGN_SYSTEM.md#6-screen-surfaces--the-single-panel-rule).
  The DS draws no page layout, so this is a product rule rather than a port — do not look for it in
  Figma.
- **Dialog dismiss — trailing on a card, leading on a screen.** The DS dialog draws no close
  affordance, so this is app-authored too. A **card** (the DS shell) uses `DialogCloseButton` at the
  trailing edge — 40px target, 20px `xmark`, `end-2 top-2` when positioned absolutely, and **last in
  the DOM** so base-ui's initial focus does not land on the way out. A dialog that is really a
  **screen** (`p-0` plus a 56/60px title band, i.e. a legacy full-screen ported into a popup) puts it
  at the **leading** edge, because that band is the app bar — and in `StarPurchaseDialog` that one
  slot carries `angle-left` or `xmark` depending on the step, so the two edges are not
  interchangeable. Never hand-roll a fourth close disc:
  [`docs/DESIGN_SYSTEM.md` §7](docs/DESIGN_SYSTEM.md#7-dialog-dismiss--trailing-on-a-card-leading-on-a-screen).
- **RTL**: `dir` is set on `<html>` from the locale. Use logical properties (`ps/pe`, `ms/me`,
  `start/end`) — never `pl/pr`. `pnpm lint:rtl` enforces this (skips `shared/ui`).
- Fonts: Inter (`--font-inter`, `next/font/google`) + Chella brand (`font-brand`), CJK/Thai
  fallback. Chella is **one weight (700) as WOFF2**, built by `pnpm fonts` from
  `design-system/fonts/` — `next/font/local` ships whatever file it is handed, so the TTF was 374 KB
  on every visitor's splash screen against 70 KB now. ExtraBold/Black were removed: the type scale
  stops at 700, so nothing could reach them.
- `shared/ui/` holds DS-ported primitives (shadcn/base-ui shell, Figma geometry inside) —
  excluded from Biome and the RTL check. Change it only to track the design system, and match
  the DS variant/size names (Button: `primary|secondary|ghost|accent|destructive` ×
  `small|medium|large`), not shadcn's defaults.
  The one non-DS change sanctioned there is **forwarding a `data-testid` the caller already passes
  to a sub-part the caller cannot otherwise reach**: `DialogContent` → its overlay, `SearchBar` →
  its cancel button, and `ConfirmDialog`, whose closed prop list makes its two buttons unreachable
  (the one file there given a `testId` *prop*). No prop name is added, no geometry moves, and a DS
  re-sync does not have to reconcile it — the same category as `button.tsx`'s `rendersNativeButton`,
  which derives a flag rather than asking every call site to remember one. Thirteen of the sixteen
  primitives needed nothing; anything beyond forwarding belongs in `shared/components/`, as
  `picker-list.tsx` did with its leading-slot variant. `shared/` also never *authors* a testid
  scope — `scripts/check-testids.mjs` rejects a literal there.
- Provider order — two trees. Base (`app/providers.tsx`, root layout, every document including a
  webview): QueryClient → Theme → Locale, with Sonner `Toaster` and dev-only React Query
  Devtools. Session (`app/session-providers.tsx`, mounted by `(web)/layout.tsx`): Auth → Realtime
  → Permission → Balance → Payment → MyChannel, with `MiniAppHost` innermost and `LoginDialog` /
  `AccountSwitcherDialog` / `SplashGate` as siblings of the stack. `Payment` sits inside `Balance`
  (it invalidates `balanceKeys` after a settle) and outside `MyChannel`; both edges are load-bearing
  and the file says why. `Permission` is highest of the three account-scoped providers because a
  grant decides whether a feature is **offered** — the shell reads it, not just the screens behind
  it — and it fails closed, so anything above it would silently be treated as ungranted.
  `CountryProvider` (`shared/lib/geo-provider.tsx`) wraps the session stack in `(web)/layout.tsx`
  rather than joining it: the country is the **connection's**, not the account's, so an account
  switch must not re-resolve it — and it stays out of the base tree so a webview pays nothing for a
  signal the native app already owns.

## Env

`shared/config/env.ts` validates `NEXT_PUBLIC_*` with zod. Values must be listed **explicitly**
(Next inlines them at build time — no computed keys). Invalid env warns rather than throws so
`next build` can proceed. Copy `.env.local.example` → `.env.local`.

Server-only values live in the **opposite file**: `shared/config/server-env.ts` — never prefixed
`NEXT_PUBLIC_`, read lazily rather than inlined, and carrying `server-only` so importing it from a
client component is a build error instead of a leak. That is where the in-cluster API origin lives;
see `server-client.ts` above for the `unwrapEnvelope` trap that comes with it.

## Testing

Vitest covers pure logic **and hooks**; Playwright covers anything that needs a server render, a
real HTTP status or a browser.

- Colocated `<file>.test.ts`. Default environment is **node**; add `// @vitest-environment jsdom`
  at the top of files touching `window`/`localStorage` (see `storage.test.ts`, `token.test.ts`).
- **Hooks are tested**, via `@testing-library/react` and a one-component `Probe` that assigns the
  hook's return value out (`use-update-me.test.tsx`, `use-update-privacy.test.tsx`). That is the
  only way to state a *race* — "the write lands on the account that was active when it was
  pressed" is not something a comment can pin.
- **Components are rendered where the assertion needs the tree**, not by default —
  `checkout-status-dialog.test.tsx`, `pay-with-card-panel.test.tsx`, `star-change-flash.test.tsx`,
  `button.test.tsx`. Prefer a hook `Probe` when it can carry the claim: a rendered tree that asserts
  nothing is worse than no test, and this repo has already been bitten by exactly that —
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is in `vitest.config.ts` because without it `LoginForm` silently
  declines to render the Google button.
- Modules read `NEXT_PUBLIC_*` at import time, so new required env vars must also be added to
  `test.env` in `vitest.config.ts` or unrelated tests start failing. `server-only` is aliased there
  to `test/stubs/server-only.ts` — that is what makes `api/server-client.ts`, `config/server-env.ts`
  and a feature's `server.ts` testable at all. Keep the real marker in the source: it is what turns
  "a client component imported the server barrel" into a build error instead of a leak.
- E2E specs live in `e2e/`, run against `next build && next start` (not `next dev` — real 404
  statuses, `generateMetadata` and ISR only behave correctly in a production build). See
  `e2e/README.md` for what belongs there. Two traps: `/dev/*` pages `notFound()` in production,
  so nothing there is reachable from a spec; and the account drawer is mounted on **every**
  route, parked `inert`, so an unscoped `getByRole` finds its eleven picker radios — scope role
  queries to `main`.
- **`data-testid`, on anything a test would address.** How QC automates it — which tool, which
  language — is theirs; that the attribute is present, stable and findable is ours. The reason is the
  nine locales: anything located by visible text is nine locators, and `e2e/get-star.spec.ts` still
  matches `/^Pay /`, which finds nothing under `vi`. Grammar is `{scope}-{element}[-{part}]`, kebab,
  where `{scope}` is a `src/features/` directory or a route segment declared in
  `shared/lib/testid-surfaces.ts` and `{part}` comes from the closed `TestIdPart` union in
  `shared/lib/test-id.ts`; **`shared/` authors no scope, it receives one** (the linter rejects a
  literal in `shared/ui`). **Never interpolate a value into an id** — a list item's identity goes in
  a companion attribute (`data-card-id`, `data-option-value`), because our identities contain `-`
  and some are user-chosen, so concatenating one into a selector breaks on the slug that has a quote
  in it. **State never goes in the id**: read `aria-checked` / `aria-selected` / `aria-expanded` /
  `aria-busy` / `disabled` / `data-open`, and if a state is not published yet, publish it as `aria-*`
  rather than encoding it. Sub-parts are **derived** (`subTestId(testId, 'confirm')`), never new
  props — four `*TestId` props are four things a caller forgets silently. Ids **ship to production**:
  `compiler.reactRemoveProperties` is deliberately not configured, so nobody has to test a different
  artifact than the one users get. `pnpm testids` regenerates the committed list in `testids/`;
  `pnpm lint:testids` fails on a grammar break or on drift. Full convention and the two naming traps
  (four navigation shells in the DOM at once; portals and deliberate remounts):
  [`docs/TEST_IDS.md`](docs/TEST_IDS.md).

## Conventions

- Files: kebab-case (`auth-provider.tsx`, `use-mobile.ts`). Components PascalCase, hooks `useX`.
- **Internal navigation is `next/link`, never a bare `<a href>`.** An anchor to a route in this app
  is a full document load: the root layout, the providers and `SessionProviders`' whole bootstrap —
  device fingerprint, `/me`, permissions, balance, my-channel — are rebuilt to reach a page the
  router could have swapped in place. `next/link` renders the same `<a>`, so middle-click, new tab,
  the status bar and being announced as a link all survive; there is **no trade-off**, which is why
  it is easy to get wrong. The decision that gets debated is "anchor or `<button
  onClick={router.push}>`" — anchor wins it, and the second question, `<a>` or `<Link>`, never gets
  asked. It shipped twice (`features/channel`'s Live surfaces, then `features/event` copying them)
  and nothing catches it: the markup, the destination and the pixels are identical, and only a
  network panel shows the reload. `pnpm lint:links` is the guard; the escape hatch for a link that
  genuinely leaves the app is `// internal-link-ok:` with the reason.
- **A prop set to `undefined` does not cross the server→client boundary** — the flight payload is
  JSON and JSON drops undefined-valued keys — so it cannot be used to *unset* something a client
  component would otherwise default. Override with a real value. It passes in jsdom and fails in
  the built page, which is how it reached production in `shared/ui/button.tsx` (see the note on
  `rendersLink` there).
- All user-facing text via `useTranslation()`; translation keys are `{module}_{slug}`.
- Verify UI changes by also running the dev server.
- Before marking any UI feature/component done, run it through
  [`docs/DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md) (data states, forms, auth paths,
  responsive, i18n/RTL/dark mode, performance, SEO, security, testing, a11y, code boundaries).
- [`README.md`](README.md) is the onboarding entry point — setup, required env, the commands — and
  is kept current. It is the short version of this file, not a create-next-app leftover.
