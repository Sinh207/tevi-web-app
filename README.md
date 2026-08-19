# Tevi — web app

Monetization platform for content creators: live streaming, posts, memberships, DMs.

This repo is a **ground-up rewrite** of the legacy `tevi-web-app` (Next.js Pages Router, JS, MUI)
onto App Router + TypeScript + Tailwind. The cutover is **big-bang**: build to feature parity by
phase, then switch. The legacy app lives at `../tevi-web-app` and is the reference for any
"how did this behave before?" question.

**Phase 1 (current): foundation + authentication.** No business features yet.

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

pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check            (lint:fix = --write)
pnpm lint:rtl         # fails on physical classes: pl/pr, ml/mr, left-/right-
pnpm format           # biome format --write

pnpm test             # vitest run
pnpm test:watch
pnpm test:e2e         # playwright — harness only, no specs written yet

pnpm icons            # regenerate the icon sprite subset + name types
pnpm brand            # regenerate favicon + PWA icons
```

`pnpm typecheck && pnpm lint && pnpm lint:rtl` is the pre-PR gate. There is **no CI workflow yet** —
run it locally, nothing else will.

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
| Tooling | pnpm, Biome (4-space, single quotes, no semicolons), Vitest, Playwright |
| Fonts | Inter (body) + Chella (brand) |

## Layout

```
src/
  app/        routing only, thin — route groups, error/loading boundaries, SEO routes, providers
  features/   self-contained modules (auth/{components,hooks,api,store,providers,index.ts})
  shared/     cross-cutting — ui/, components/, hooks/, lib/, i18n/, config/
  proxy.ts    Next 16's renamed middleware — legacy URL redirects only

design-system/  upstream Figma exports; the source for generated assets, never served
docs/           see below
scripts/        codegen and checks used by pnpm dev / build
```

Boundaries are enforced by review, not tooling: a feature must not reach into another feature's
internals (barrel imports only), and `shared/` must never import from `features/`.

## Read next

| | |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Full architecture — API layer, auth flow, storage, i18n, styling. Written for Claude Code, but it is the most complete map of the repo. Start here. |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Where colours, type and spacing come from, how icons and brand assets are generated, and the traps that fail silently. Required reading before touching `globals.css`, `shared/ui/`, or anything brand-related. |
| [`docs/DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md) | The checklist for "ready to merge" — data states, forms, a11y, RTL, security. For reviewers too, not just authors. |

## Two things that surprise people

**Some files are generated but committed.** `src/shared/ui/icon-names.ts`,
`src/shared/ui/sprite.ts`, `public/tevi-icons.<hash>.svg` and the favicon/PWA icons all come from
`design-system/` via `scripts/`. They are committed so a fresh clone typechecks without a build;
tests regenerate them in memory and fail on drift. If one of those tests is red, run `pnpm icons`
or `pnpm brand` and commit the result — don't hand-edit.

**Figma spacing indices are not Tailwind indices.** The Figma ramp is non-linear: `--spacing-5` is
24px, but Tailwind `p-5` is 20px. Reading a spec that says "spacing 5"? Write `p-6`. Full table in
[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md#5-tokens-in-globalscss).
