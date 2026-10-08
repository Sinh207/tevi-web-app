# Tevi — web app

Monetization platform for content creators: live streaming, posts, memberships, DMs.

This repo is a **ground-up rewrite** of the legacy `tevi-web-app` (Next.js Pages Router, JS, MUI)
onto App Router + TypeScript + Tailwind. The cutover is **big-bang**: build to feature parity by
phase, then switch. The legacy app lives at `../tevi-web-app` and is the reference for any
"how did this behave before?" question.

**Where it stands:** the foundation is done and business features are landing on top of it — 25
feature modules today (payment/Stripe, membership, donation, payout, gift-code, star-transfer,
affiliate, analytics, notification, search, channel, identification, mini-app…). Anything not built
yet is still read out of the legacy app.

## Getting started

Requires **Node ≥ 20.9** (Next 16) and **pnpm** (v11 here — npm/yarn are not supported, the
lockfile is pnpm's).

```bash
pnpm install
cp .env.local.example .env.local   # then fill in the values
pnpm dev                           # http://localhost:3000
```

`.env.local` is validated by zod at startup (`src/shared/config/env.ts`), so a missing or malformed
variable fails loudly instead of surfacing as a broken request later. Required:
`NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_W_API_DOMAIN`, `NEXT_PUBLIC_DOORMAN_DOMAIN`,
`NEXT_PUBLIC_SIGN_SECRET`, and the four core `NEXT_PUBLIC_FIREBASE_*` keys. Everything else (OAuth
client IDs, analytics) is optional and degrades gracefully. Only `NEXT_PUBLIC_*` reaches the
browser — server-only secrets must not carry that prefix.

## Commands

```bash
pnpm dev              # dev server (Turbopack) — rebuilds the icon sprite subset first
pnpm build            # production build (pinned to webpack)
pnpm start            # serve the production build

pnpm cache            # how much disk `.next/` is holding, and what is safe to prune
pnpm cache:clean      # prune it (skips any store a running dev server is using)

pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check            (lint:fix = --write)
pnpm lint:rtl         # fails on physical classes: pl/pr, ml/mr, left-/right-
pnpm format           # biome format --write

pnpm lint:icons       # icons only from the DS sprite (/dev/icons): no inline <svg>, no icon package
pnpm lint:testids     # data-testid grammar + drift against the committed testids/ catalog
pnpm testids          # regenerate that catalog

pnpm test             # vitest run
pnpm test:watch
pnpm test:e2e         # playwright — builds and starts the app itself, so it is slow

pnpm icons            # regenerate the icon sprite subset + name types
pnpm brand            # regenerate favicon + PWA icons
pnpm fonts            # rebuild the Chella brand font as WOFF2
pnpm art              # rebuild the committed illustrations
pnpm art:audit        # fails if any static image in src/ still points at another host
```

`pnpm typecheck && pnpm lint && pnpm lint:rtl && pnpm lint:testids` is the pre-PR gate, and
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the same four plus `pnpm test`,
`pnpm build` and the Playwright suite on every push and PR. Run the gate locally anyway — it is far
faster than finding out from CI.

Note that `pnpm build` is pinned to webpack while `pnpm dev` runs Turbopack, and the two disagree
about some assets. A green build does not prove the dev server starts; after touching anything
binary, run both.

## Stack

| | |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind v4 (CSS-first `@theme`), shadcn/ui on base-ui primitives |
| Data | TanStack Query + axios with custom interceptors |
| Local state | Zustand — UI state only, never a mirror of server data |
| i18n | i18next, self-managed in-repo, 9 locales incl. `ar` (RTL) |
| Theming | next-themes, light + dark |
| Forms | react-hook-form + zod (`@hookform/resolvers`) |
| Payments / KYC | Stripe (`@stripe/react-stripe-js`), Sumsub web SDK |
| Tooling | pnpm, Biome (4-space, single quotes, no semicolons), Vitest, Playwright |
| Fonts | Inter (body) + Chella (brand) |

## Layout

```
src/
  app/        routing only, thin — route groups, error/loading boundaries, SEO routes, providers
  features/   self-contained modules (auth/{components,hooks,api,store,providers,index.ts})
  shared/     cross-cutting — ui/, components/, hooks/, lib/, i18n/, config/
  proxy.ts    Next 16's renamed middleware — legacy URL redirects, the /app/* webview
              context, and the CSP + its per-request nonce

design-system/  upstream Figma exports; the source for generated assets, never served
docs/           see below
scripts/        codegen and checks used by pnpm dev / build
```

Boundaries are enforced by review, not tooling: a feature must not reach into another feature's
internals (barrel imports only), and `shared/` must never import from `features/`. Besides
`index.ts`, four narrower barrels at a feature's root are sanctioned — `routes.ts`, `skeleton.ts`,
`dev.ts`, `server.ts`. An import of one of those is correct, not a violation; [`CLAUDE.md`](CLAUDE.md)
says why each exists.

## Read next

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Full architecture — API layer, auth flow, storage, i18n, styling. Written for Claude Code, but it is the most complete map of the repo. Start here. |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Where colours, type and spacing come from, the single-panel screen-surface rule (§6), how icons and brand assets are generated, and the traps that fail silently. Required reading before touching `globals.css`, `shared/ui/`, a screen's surface, or anything brand-related. |
| [`docs/DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md) | The checklist for "ready to merge" — data states, forms, a11y, RTL, security. For reviewers too, not just authors. |
| [`docs/TEST_IDS.md`](docs/TEST_IDS.md) | The `data-testid` convention QC automates against, and the two naming traps. |
| [`docs/STATIC_ASSETS.md`](docs/STATIC_ASSETS.md) | Why no static image is fetched from a CDN, and how to add one that isn't. |
| [`docs/WEBVIEW.md`](docs/WEBVIEW.md) | The `/app/*` namespace the mobile apps open, and the native JS bridge. |
| [`docs/MINI_APP.md`](docs/MINI_APP.md) | Third-party apps framed inside Tevi — the `postMessage` contract and its security posture. |
| [`docs/PAYMENT.md`](docs/PAYMENT.md) | Stripe, checkout and saved cards: the four `action` branches, and what is still unbuilt. |
| [`docs/POST.md`](docs/POST.md) | Posts end to end: the card and what it hands up to its list, the post page, paywall and paid interaction, replies, the composer, bookmarks and collections. |
| [`docs/MESSAGE.md`](docs/MESSAGE.md) | Direct messages: the inbox, a conversation, the socket frames, how a send survives going offline, and the floating chat window. |
| [`docs/END_RAIL_OPEN_ITEMS.md`](docs/END_RAIL_OPEN_ITEMS.md) | The desktop end rail — what is deliberately unfinished, and why. |
| [`docs/BACKEND_QUESTIONS.md`](docs/BACKEND_QUESTIONS.md) | Contract questions the client is still guessing at. Read before "fixing" an odd-looking payload. |

## Two things that surprise people

**Some files are generated but committed.** `src/shared/ui/icon-names.ts`,
`src/shared/ui/sprite.ts`, `public/tevi-icons.<hash>.svg` and the favicon/PWA icons all come from
`design-system/` via `scripts/`. They are committed so a fresh clone typechecks without a build;
tests regenerate them in memory and fail on drift. If one of those tests is red, run `pnpm icons`
or `pnpm brand` and commit the result — don't hand-edit.

**Figma spacing indices are not Tailwind indices.** The Figma ramp is non-linear: `--spacing-5` is
24px, but Tailwind `p-5` is 20px. Reading a spec that says "spacing 5"? Write `p-6`. Full table in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md#5-tokens-in-globalscss).
