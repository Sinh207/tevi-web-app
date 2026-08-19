# Definition of Done — UI / Feature checklist

Checklist to run through before marking any UI feature or component as done. Not every item
applies to every change — skip what's genuinely not relevant, but don't skip because it's
inconvenient to check. New to the repo? This doc plus [`CLAUDE.md`](../CLAUDE.md) is the fastest
way to understand what "done" means here (plus [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) for
anything touching tokens, icons or brand assets). **Reviewers**: use this checklist too, not just the
author — it's shared vocabulary for what "ready to merge" means, not a self-report form.

**Quick reference** — 1 [Data states](#1-data-states) · 2 [Forms & mutations](#2-forms--mutations)
· 3 [Auth-specific](#3-auth-specific-read-featuresauth-sharedlibapitokents-first) · 4 [Responsive](#4-responsive-layout)
· 5 [i18n/RTL/dark mode](#5-i18n--rtl--dark-mode) · 6 [Performance](#6-performance--load-speed)
· 7 [SEO](#7-seo--metadata-page-level-routes-only) · 8 [Security](#8-security) · 9 [Testing](#9-testing)
· 10 [Accessibility](#10-accessibility) · 11 [Code boundaries](#11-code-boundaries-repo-specific-easy-to-miss-when-new)
· 12 [Verify](#12-verify-before-opening-the-pr)

## 1. Data states

Every view backed by `TanStack Query` must explicitly handle all four states — never let one
fall through to a blank screen:

- [ ] **Loading** — skeleton or spinner matching the final layout's shape (avoid layout shift
      when data arrives). No raw "Loading..." text unless the component is trivial.
- [ ] **Error** — user-facing message via `useTranslation()`, not the raw error/stack. Retry
      action where the user can plausibly recover (button calling `refetch()`).
- [ ] **Empty / no data** — explicit empty state (icon/copy), never an empty `<div>` or blank list.
- [ ] **Success** — the actual data render, including partial data (e.g. some fields null/missing
      from the API).

## 2. Forms & mutations

- [ ] Submit button shows a loading state and is disabled while the mutation is pending — no
      double-submit on a slow network or a double-click.
- [ ] Validation errors are field-level, inline, and translated — not a generic toast for
      everything.
- [ ] Mutation success/failure feedback is visible (toast via `meta.showErrorToast` or an
      explicit success state) — a mutation should never resolve silently.
- [ ] On success, relevant queries are invalidated (`invalidateQueries`) so the UI reflects the
      new state without a manual refresh.
- [ ] Unsaved-changes edge cases considered (navigating away mid-edit, resubmitting after an
      error).

## 3. Auth-specific (read `features/auth/`, `shared/lib/api/token.ts` first)

- [ ] Behavior verified for both an anonymous session and a signed-in account — the app always
      keeps an anonymous Firebase session, don't assume `currentUser` is non-null.
- [ ] Token refresh / 401 handling exercised (expired token → proactive refresh or single-flight
      refresh-then-retry), not just the happy path.
- [ ] Session-lost flow checked: a dead account is dropped with its ETag cache and the React
      Query cache, **never promoting another account and never redirecting** — the app drops to
      anonymous in place and the screen stays put (see `client.ts`'s `handleDeadAccount`). A
      background account dying must not disturb the session on screen at all.
- [ ] Anything that needs a real account gates the **action**, not the route — `useRequireAuth`
      opens the login dialog on click. Never assume the user was bounced to `/login`.
- [ ] If touching multi-account: switching accounts, hitting `MAX_ACCOUNTS` (10), and removing
      the active account all behave correctly.
- [ ] No token/account data logged or leaked into error toasts (see §8 Security — same rule,
      this is its auth-specific instance).

## 4. Responsive layout

Test at all custom breakpoints, not just mobile/desktop:

- [ ] sm 612 / md 900 / lg 1040 / xl 1440 — resize through each, no broken layout in between.
- [ ] No horizontal overflow/scroll on the page body at any width.
- [ ] Touch targets ≥ 40px on mobile; no hover-only interactions with no mobile equivalent.
- [ ] Long/dynamic text (usernames, titles) doesn't break layout — truncate or wrap deliberately.

## 5. i18n / RTL / dark mode

- [ ] All user-facing text goes through `useTranslation()` — no hardcoded strings.
- [ ] Logical CSS properties only (`ps/pe`, `ms/me`, `start/end`) — never `pl/pr`, `ml/mr`,
      `left/right`. Check the component in Arabic (RTL) — mirroring should look correct.
      Run `pnpm lint:rtl` to catch the common cases automatically.
- [ ] Renders correctly in both light and `.dark` — check contrast, borders, icons that assume
      a background color.

## 6. Performance / load speed

- [ ] Images via `next/image` (or explicit lazy-loading) — no unoptimized `<img>` for
      user-facing content.
- [ ] Long/unbounded lists are paginated or virtualized — never render an unbounded array.
- [ ] No unnecessary re-renders from unstable references (inline objects/functions passed to
      memoized children, missing `useMemo`/`useCallback` where it matters).
- [ ] TanStack Query: sensible `staleTime`/`enabled`, no redundant refetching — invalidate only
      the queries actually affected by a mutation (see §2 Forms), not a broad catch-all.
- [ ] Check the Network tab: no duplicate requests, no waterfalls that could be parallelized.
- [ ] Client bundle isn't bloated by an unnecessary new dependency — check if `shared/` or an
      existing lib already covers the need before adding a package.

## 7. SEO & metadata (page-level routes only)

- [ ] `generateMetadata`/`metadata` export set with a real title + description, not the layout
      default.
- [ ] Open Graph / Twitter card fields set for anything shareable (profile, post, stream page).
- [ ] Public pages are server-rendered where possible — remember there's no SSR bearer token, so
      anything requiring auth must be client-fetched, not blocked on the server.
- [ ] New public route added to `src/app/sitemap.ts` if it should be discoverable/indexed.

## 8. Security

**XSS**
- [ ] Default to plain text rendering (`{content}`) — React escapes it automatically. Nobody
      should reach for `dangerouslySetInnerHTML` for plain user text.
- [ ] If HTML *must* be rendered (rich text post/bio), it goes through a sanitizer (e.g.
      DOMPurify) with an explicit allow-list — never raw API/user HTML. There is no sanitizer
      dependency in the repo yet; adding `dangerouslySetInnerHTML` without one is a blocker, not
      a nit.
- [ ] User-provided values are never interpolated into `href`/`src` without validating the
      scheme (block `javascript:`/`data:` for links, e.g. avatar/profile links, share URLs).
- [ ] No `eval`, `new Function`, or building DOM from strings (`innerHTML =`, `document.write`).
- [ ] Redirects/navigation built from a user-controlled value (query param, API field) are
      validated as a same-origin relative path — never `window.location = <raw input>`
      (open-redirect). Not yet exercised anywhere in the repo (no redirect-from-param flow
      exists), but the first `?next=`/`?redirect=` param added should follow this from day one.

**Data & secrets**
- [ ] No secrets/tokens logged to console, sent to third-party scripts/analytics, or included in
      error messages shown to the user.
- [ ] Only `NEXT_PUBLIC_*` env vars reach the client (see `shared/config/env.ts`) — anything
      genuinely secret stays server-only and unprefixed. `NEXT_PUBLIC_SIGN_SECRET` is the one
      intentional exception (public HMAC secret, matches legacy) — don't treat that as license
      to add other "public" secrets.
- [ ] User input validated at the boundary (form schema / API response schema), not trusted
      blindly before rendering or sending onward.
- [ ] Any new persisted key goes through `shared/lib/storage.ts` (`STORAGE_KEYS` +
      `storage.get/set`) — never a raw `localStorage` call. Nothing sensitive beyond the
      existing auth tokens gets persisted client-side without thinking through the XSS
      trade-off this repo already accepts for auth.
- [ ] New env var added to the zod schema in `shared/config/env.ts`, not read via raw
      `process.env.X` in client code. Server-only secrets stay unprefixed (no `NEXT_PUBLIC_`).

**API / requests**
- [ ] Never call axios directly from a component — go through a model + `hooks/api` query hook
      (keeps HMAC signing, auth headers, refresh logic consistent).
- [ ] No SSRF-shaped code: server-side fetches never hit a URL built from unvalidated user input
      (allow-list known hosts). Not yet applicable — no server-side fetches exist in the repo
      today, but this applies the moment one is added (Server Component, Route Handler, etc).
- [ ] Any new external `<img>`/media source is added to `next.config.ts`'s `images.remotePatterns`
      deliberately — don't widen it to a wildcard to make a screenshot work.

**Dependencies & headers**
- [ ] New dependency reviewed (maintained, no known CVEs, not a trivial one-liner you could
      inline instead) before adding it — every dependency is attack surface.
- [ ] If the change affects response headers (`next.config.ts` `headers()`), keep the existing
      security headers (HSTS, `X-Frame-Options`, `X-Content-Type-Options`) intact; flag it if you
      think this is the time to add a `Content-Security-Policy` (none is set yet).

## 9. Testing

There's no React component-render testing set up (no `@testing-library/react`) — unit tests
target pure logic, E2E covers the actual UI.

- [ ] New/changed **pure logic** (utils, stores, interceptors, parsers — anything importable
      without rendering a component) has a colocated Vitest test: `<file>.test.ts` next to the
      file it tests. See `src/shared/lib/storage.test.ts` or `.../api/token.test.ts` for the
      house style (`describe`/`it`, `beforeEach` resetting state, `// @vitest-environment jsdom`
      only when the file touches `window`/`localStorage`).
- [ ] Tests cover the actual bug/edge case being fixed, not just the happy path — e.g. for
      `storage.ts` that means the legacy-migration edge cases (idempotency, not clobbering an
      existing key), not just "it stores a value."
- [ ] `pnpm test` passes locally before pushing; don't rely on CI to discover a broken test.
- [ ] If the change is user-facing and reusable (login flow, account switch, a page that will be
      hit repeatedly by regressions), add or update a Playwright spec — the harness
      (`pnpm test:e2e`) exists but has no specs yet, so the first flows written here set the
      convention for everyone after.
- [ ] Don't test implementation details (internal state shape, private helpers) — test behavior
      through the module's public exports/UI, the same way a consumer would use it.

## 10. Accessibility

- [ ] Icon-only buttons have an `aria-label`.
- [ ] Interactive elements are keyboard-reachable and show a visible focus state.
- [ ] Semantic HTML (`button`, `label`, headings) over generic `div`/`span` with click handlers.
- [ ] Modals/drawers/popovers are built on the base-ui/shadcn Dialog primitive (which already
      handles focus trap and `Esc`-to-dismiss) — don't hand-roll one from a `<div>` + state;
      there's no Dialog component in `shared/ui` yet, so the first one added sets the pattern.

## 11. Code boundaries (repo-specific, easy to miss when new)

- [ ] Feature code doesn't import another feature's internals — only via its `index.ts` barrel.
- [ ] Nothing in `shared/` imports from `features/`.
- [ ] Server-vs-client sync only via TanStack Query; the event bus (`@shared/lib/event-bus`) is
      for imperative UI-only signals, never for syncing server data.
- [ ] Zustand is for local/UI-only state (open/closed, wizard step, draft form values) — never
      mirror server data into a Zustand store; that's what TanStack Query's cache is for.

## 12. Verify before opening the PR

- [ ] Run the dev server and manually click through: loading, error, empty, success, RTL,
      dark mode, and at least one narrow (sm) and one wide (xl) viewport.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm lint:rtl` pass.
- [ ] Tests pass per §9 (`pnpm test`, and `pnpm test:e2e` if a Playwright spec applies).
