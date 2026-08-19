# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Tevi** — monetization platform for content creators (live streaming, posts, memberships, DMs).
This is a **ground-up rewrite** of the legacy `tevi-web-app` (Next.js Pages Router / JS / MUI) into a
modern stack. Migration strategy is **big-bang**: build to feature-parity by phase, then cut over.
Auth is Bearer-JWT via the Authorization header; tokens live in localStorage under namespaced
`tevi.*` keys (see `shared/lib/storage.ts`) — same-origin cutover keeps sessions (a one-time
migration upgrades legacy keys, e.g. `user_logged_list` / `user_id`, on first load).

**Phase 1 (current): foundation + authentication only.** No business features yet. The legacy app
lives at `../tevi-web-app` and is the reference for behavior/parity questions.

## Stack

- **Next.js 16 App Router** + React 19 + **TypeScript** (strict)
- **Tailwind v4** (CSS-first `@theme` in `globals.css`) + **shadcn/ui** (base-nova, base-ui primitives)
- **TanStack Query + axios** (custom interceptors), **Zustand** for local/UI state only
- **pnpm** + **Biome** (lint+format; 4-space, single quotes, no semicolons, line width 100)
- next-themes (dark mode), i18next (self-managed, statically bundled), Vitest (unit), Playwright (E2E)

## Commands

```bash
pnpm dev                              # dev server (Turbopack, Next 16 default) on :3000
pnpm build                            # production build — pinned to webpack (`next build --webpack`)
pnpm typecheck                        # tsc --noEmit
pnpm lint                             # biome check          (lint:fix = --write)
pnpm lint:rtl                         # scripts/check-rtl-classes.sh — fails on pl/pr/ml/mr, left-/right-
pnpm test                             # vitest run (src/**/*.{test,spec}.{ts,tsx})
pnpm test src/shared/lib/storage.test.ts   # single file
pnpm vitest run -t 'migrates legacy'  # single test by name
pnpm test:watch
pnpm test:e2e                         # playwright (config + `e2e/`; builds first, so it is slow)
```

`pnpm typecheck && pnpm lint && pnpm lint:rtl` is the pre-PR gate (see `.github/pull_request_template.md`).

## Architecture — feature-first / modular

```
src/
  app/        routing only (thin). Route groups, error/loading boundaries, SEO routes, providers.
    layout.tsx           the document + `providers.tsx` (base: QueryClient → Theme → Locale)
    session-providers.tsx   Auth → Realtime → Permission → Balance → MyChannel + dialogs + splash
    (web)/      the website. `(web)/layout.tsx` is the one place the session stack is mounted.
      (main)/   the DS shell (navbar / tab bar); `login/`, `signup/`, `dev/` sit beside it.
    app/        `/app/*` webview screens — no shell and **no session** (below).
  features/   self-contained modules (auth/{components,hooks,api,store,providers,index.ts}).
  shared/     cross-cutting: ui/ (shadcn), components/, hooks/, lib/, i18n/, config/.
  proxy.ts    Next 16's renamed middleware (`export function proxy`) — legacy URL redirects
              plus the `/app/*` webview context (below). No auth: that is client-side.
```

**`/app/*` = mobile-app webview screens**, not website pages: no shell, no navigation (the
native chrome is around them), `noindex` + canonical to the public twin, and `robots.ts`
disallows the namespace. The app owns their presentation context and sends it on the URL —
`?lang=vi&theme=dark&platform=ios&v=3.14.0` — which `proxy.ts` turns into `x-tevi-webview*`
request headers (stripped from incoming requests first) that `app/layout.tsx` and
`getServerT()` read, so language/direction/theme are right on the first paint. Contract and
parsers live in `shared/config/webview.ts`; full spec in [`docs/WEBVIEW.md`](docs/WEBVIEW.md).
Never pass auth in those params — the webview is same-origin and already shares the token
store.

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
- A feature must NOT import another feature's internals — only via its `index.ts` barrel.
- `shared/` must NOT import from `features/`. `app/` composes, holds no business logic.
- Aliases: `@/*`, `@app/*`, `@features/*`, `@shared/*`.
- The `shared/` → `features/` boundary is kept by **`api/request-context.ts`**: a mutable module
  holding device-fingerprint + Turnstile tokens that the auth feature *pushes into* and the axios
  client *reads from*. Any future "shared infra needs feature data" case follows this pattern
  rather than an import.

## Three communication primitives (do not mix)

1. **TanStack Query** — server-state sync. `invalidateQueries` / optimistic mutations. DEFAULT for
   anything backed by the API. Never mirror server data into Zustand.
2. **Event bus** (`@shared/lib/event-bus`, mitt, typed `AppEvents`) — imperative UI-only signals
   (`auth:turnstile-passed`, `auth:signed-in|out`, `auth:session-expired`, `auth:accounts-synced`).
   NEVER to sync server data. **Every declared event must have an emitter** — add one when the
   thing that fires it exists, not in anticipation.
3. **Socket** (`@features/realtime`, socket.io) — the **user room**: this account's balance and
   Premium state, over `${DOORMAN}/user` at path `/doorman/`. Open **only for a real account** —
   every visitor carries an anonymous session, so without that gate the app holds a websocket per
   guest to be told nothing. Subscribe with `useSocketEvent(name, handler)`.
   **A socket event is a signal, never a source**: invalidate the query that owns the data, never
   write the payload into the cache — a frame has no ordering guarantee against the HTTP responses
   beside it, so trusting it can move a figure backwards. Transport is `shared/lib/socket/`
   (injected `io`, so it is testable without a browser); `inbox_change` is not forwarded because
   nothing reads an inbox yet.

## API layer (`shared/lib/api/`)

- `client.ts` — the browser axios instance. Request: device-id + Turnstile headers, Bearer auth with
  **proactive refresh** (5s skew), **ETag** `If-None-Match`, **HMAC WebCrypto signing** (appends
  `?verify=`). Response: **envelope unwrap** (backend returns `{ data: payload }` → models see flat
  DTOs), ETag store, **304 → replay cached body as 200** (or re-ask unconditionally if the body is
  gone), **single-flight 401 refresh, one flight per account**, retry ×2 on 5xx/429/network.
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
- `server-client.ts` — `createServerApiModel` for RSC. **Public content only** (no bearer exists
  server-side), HMAC-signed, 10s timeout so a silent upstream can't hold a render. GETs are
  `no-store` unless the model (or the call) opts into ISR with `revalidate` seconds — do that for
  anything public and slow-changing rather than paying W_API latency on every render.
- `query-client.ts` — 60s `staleTime`, no refetch-on-focus, never retries 4xx, opt-in error toasts
  via `meta.showErrorToast: true | 'custom message'`.
- `errors.ts` — `ApiError` (`status`, `isNetwork`, `isCanceled`, `isAuthError()`); everything rejects
  normalized.
- `unwrap.ts` / `origins.ts` — the two rules both clients share: envelope unwrapping and which host
  may receive credentials. Kept axios-free so `server-client.ts` can use them. Unwrapping is
  **scoped to W_API** (`unwrapApiEnvelope`) — only Tevi wraps in `{ data }`; another host's `data`
  field is its own payload.
- `interceptors/etag.ts` — two tiers: an LRU `Map` (1000 entries) in front of IndexedDB
  (`tevi-etag` v2, store `etags`, key `<accountId>::<origin><path>?<sorted params>`, 24h TTL).
  **One shared connection** per page; expired records pruned once on idle; deletes by key range,
  not a full key scan; writes funnel through `idbWrite` so a failure can never reach the page and
  `QuotaExceededError` drops the cache instead of failing forever. Bodies over **256KB are not
  cached at all** (neither tier). Bump `DB_VERSION` to discard the store — a cache is rebuilt,
  never migrated. Every path degrades to memory-only when IndexedDB is missing or blocked.
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
happen before any store hydrates. Never touch `localStorage` directly.

## Auth (`features/auth/`)

Firebase is used **only** for the anonymous session (lazily dynamic-imported to stay out of the
initial bundle); everything else is custom JWT against `${W_API}/auth`. The app always keeps a
session: on bootstrap it either `refreshUser()`s an existing token or creates an anonymous one, and
`signOut()` re-establishes anonymous. After a real sign-in, leftover anon accounts are purged.

`useAuth()` → `{ currentUser, isAuthenticated, isAnonymous, isBootstrapping, isSigningIn,
isSigningOut, accounts, activeId, turnstileSiteKey, turnstileNonce, signInErrorKey, signInErrorText,
signInWithAnonymous, signInWithGoogle, signInWithEmail, signOut, switchAccount, removeAccount,
refreshUser }`. `signInWith*` route through `runSignIn`, which treats **HTTP 406 as "Cloudflare
Turnstile challenge required"** → fetches the site key into the store instead of throwing.

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

## i18n (`shared/i18n/`)

Self-managed in-repo (no Crowdin): one flat `locales/<lng>/translation.json` per locale, single
`translation` namespace. 9 `SUPPORTED_LOCALES` (incl. `ar` for RTL), 8 surfaced in the switcher
(`UI_LOCALES` / `LANGUAGES`). Locale is resolved server-side in `layout.tsx`
(cookie `tevi.locale` → `Accept-Language` → `en`) and passed down to `AppProviders`.
Client: `useTranslation()` from `@shared/i18n/use-translation` (adds `changeLanguage`, which syncs
storage + cookie + `<html lang|dir>`). RSC: `getServerT()` / `getT(locale)`.

**One locale reaches the browser, not nine.** `resources.ts` (all nine, 135 KB minified) is
**server-only**; `client.ts` bundles **English alone** — it is `FALLBACK_LNG`, so it stands behind
any key a locale has not translated. All nine are complete (685 keys each); keep them that way —
a new key belongs in every locale, not only in English.
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
  Weights are typed per glyph, so an unavailable one is a type error. If a glyph is missing, say
  so; never substitute a shape and never hand-draw a path. Browse at `/dev/icons` (dev-only).
- Brand: `<Logo size={48} />` from `@shared/ui/logo`. There is **no wordmark** in the DS — the
  "Tevi" lettering is live text in the Chella font, not an asset.
- `design-system/` holds the upstream sprite and logo. Nothing there is served; it is the input to
  `pnpm icons` (sprite subset + name types) and `pnpm brand` (favicon + PWA icons), whose outputs
  are generated-but-committed and guarded by tests. **Read
  [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) before changing any of it** — it covers the
  pipeline, the runbook, and the silent-failure traps (sprite aliases, Tailwind inlining shadow
  values, manifest icons pointing at nothing).
- **RTL**: `dir` is set on `<html>` from the locale. Use logical properties (`ps/pe`, `ms/me`,
  `start/end`) — never `pl/pr`. `pnpm lint:rtl` enforces this (skips `shared/ui`).
- Fonts: Inter (`--font-inter`) + Chella brand (`font-brand`), CJK/Thai fallback.
- `shared/ui/` holds DS-ported primitives (shadcn/base-ui shell, Figma geometry inside) —
  excluded from Biome and the RTL check. Change it only to track the design system, and match
  the DS variant/size names (Button: `primary|secondary|ghost|accent|destructive` ×
  `small|medium|large`), not shadcn's defaults.
- Provider order — two trees. Base (`app/providers.tsx`, root layout, every document including a
  webview): QueryClient → Theme → Locale, with Sonner `Toaster` and dev-only React Query
  Devtools. Session (`app/session-providers.tsx`, mounted by `(web)/layout.tsx`): Auth → Realtime
  → Permission → Balance → MyChannel, plus `LoginDialog` / `AccountSwitcherDialog` / `SplashGate` as
  siblings. `Permission` is highest of the three account-scoped providers because a grant decides
  whether a feature is **offered** — the shell reads it, not just the screens behind it — and it
  fails closed, so anything above it would silently be treated as ungranted.

## Env

`shared/config/env.ts` validates `NEXT_PUBLIC_*` with zod. Values must be listed **explicitly**
(Next inlines them at build time — no computed keys). Invalid env warns rather than throws so
`next build` can proceed. Server-only secrets must NOT be prefixed. Copy `.env.local.example` →
`.env.local`.

## Testing

Vitest covers pure logic **and hooks**; Playwright covers anything that needs a server render, a
real HTTP status or a browser.

- Colocated `<file>.test.ts`. Default environment is **node**; add `// @vitest-environment jsdom`
  at the top of files touching `window`/`localStorage` (see `storage.test.ts`, `token.test.ts`).
- **Hooks are tested**, via `@testing-library/react` and a one-component `Probe` that assigns the
  hook's return value out (`use-update-me.test.tsx`, `use-update-privacy.test.tsx`). That is the
  only way to state a *race* — "the write lands on the account that was active when it was
  pressed" is not something a comment can pin. Whole component trees are still not rendered.
- Modules read `NEXT_PUBLIC_*` at import time, so new required env vars must also be added to
  `test.env` in `vitest.config.ts` or unrelated tests start failing.
- E2E specs live in `e2e/`, run against `next build && next start` (not `next dev` — real 404
  statuses, `generateMetadata` and ISR only behave correctly in a production build). See
  `e2e/README.md` for what belongs there. Two traps: `/dev/*` pages `notFound()` in production,
  so nothing there is reachable from a spec; and the account drawer is mounted on **every**
  route, parked `inert`, so an unscoped `getByRole` finds its eleven picker radios — scope role
  queries to `main`.

## Conventions

- Files: kebab-case (`auth-provider.tsx`, `use-mobile.ts`). Components PascalCase, hooks `useX`.
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
- `README.md` is still the untouched create-next-app default — don't treat it as a source of truth.
