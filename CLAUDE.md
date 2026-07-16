# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Tevi** — monetization platform for content creators (live streaming, posts, memberships, DMs).
This is a **ground-up rewrite** of the legacy `tevi-web-app` (Next.js Pages Router / JS / MUI) into a
modern stack. Migration strategy is **big-bang**: build to feature-parity by phase, then cut over.
Auth is Bearer-JWT via the Authorization header; tokens live in localStorage
(`user_logged_list` / `user_id`) — same-origin cutover keeps sessions (migrate the stored
account shape at switch-over if it drifts).

**Phase 1 (current): foundation + authentication only.** No business features yet.

## Stack

- **Next.js 16 App Router** + React 19 + **TypeScript** (strict)
- **Tailwind v4** (CSS-first `@theme` in `globals.css`) + **shadcn/ui** (base-nova, base-ui primitives)
- **TanStack Query + axios** (custom interceptors), **Zustand** for local state
- **pnpm** + **Biome** (lint+format; 4-space, single quotes, no semicolons)
- next-themes (dark mode), i18next (self-managed, bundled), Serwist (PWA), Playwright (E2E)

## Commands

```bash
pnpm dev              # dev server (Turbopack) on :3000
pnpm build            # production build (webpack — required by Serwist PWA)
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm lint:fix         # biome check --write
pnpm test:e2e         # playwright
```

## Architecture — feature-first / modular

```
src/
  app/        routing only (thin). Route groups, error/loading boundaries, SEO routes, providers.
  features/   self-contained modules (auth/{components,hooks,api,store,providers,index.ts}).
  shared/     cross-cutting: ui/ (shadcn), components/, hooks/, lib/, i18n/, config/.
```

**Boundary rules (enforce):**
- A feature must NOT import another feature's internals — only via its `index.ts` barrel.
- `shared/` must NOT import from `features/`. `app/` composes, holds no business logic.
- Aliases: `@/*`, `@app/*`, `@features/*`, `@shared/*`.

## Three communication primitives (do not mix)

1. **TanStack Query** — server-state sync. Use `invalidateQueries` / optimistic mutations. This is
   the DEFAULT for anything backed by the API.
2. **Event bus** (`@shared/lib/event-bus`, mitt, typed) — imperative UI-only signals
   (`home:refresh`, `auth:turnstile-passed`). NEVER use it to sync server data.
3. **Socket** (later phase) — realtime adapter over socket.io.

## API layer (`shared/lib/api/`)

- `client.ts` — axios instance + interceptors: Bearer auth (+ proactive refresh), **HMAC WebCrypto
  signing** (`?verify=`, client-side), **ETag** `If-None-Match` (memory + IndexedDB per-account),
  **single-flight 401 refresh** (drops only the dead account), retry (5xx/429/network).
- `token.ts` — multi-account store (max 10, `useSyncExternalStore`), **localStorage-only**
  (`user_logged_list` + `user_id`; accepts the XSS trade-off — backend auths via the
  Authorization header, not cookies). No SSR bearer → server fetches are public-only.
- `model.ts` — `createApiModel({ apiBase })` factory. Two-file model pattern:
  `apiX = createApiModel(...)` then a domain file composes its methods.
- `query-client.ts` — opt-in error toasts via `meta.showErrorToast`; never retries 4xx.

Never call axios directly from components — go through a model + a `hooks/api` query hook.

## Auth (`features/auth/`)

Hybrid Firebase (Anonymous + Twitter only) + custom JWT. App always keeps an anonymous session.
`useAuth()` → `{ currentUser, isAuthenticated, signInWith*, signOut, switchAccount }`.
HMAC secret (`NEXT_PUBLIC_SIGN_SECRET`) is intentionally client-side (public secret, matches legacy).

## Styling

- Semantic tokens in `globals.css` (`--primary` = #501BC0, gray/primary 25–900, semantic pairs),
  light + `.dark`. Custom breakpoints: sm 612 / md 900 / lg 1040 / xl 1440.
- **RTL**: `dir` is set on `<html>` from the locale (Arabic). Use logical properties (`ps/pe`,
  `ms/me`, `start/end`) — never `pl/pr`.
- Fonts: Inter (`--font-inter`) + Chella brand (`--font-brand`/`font-brand`), CJK/Thai fallback.

## Env

`shared/config/env.ts` validates `NEXT_PUBLIC_*` with zod. Server-only secrets must NOT be prefixed.
Copy `.env.local.example` → `.env.local`.

## Conventions

- Files: kebab-case (`auth-provider.tsx`, `use-mobile.ts`). Components PascalCase, hooks `useX`.
- All user-facing text via `useTranslation()` (`@shared/i18n/use-translation`).
- Verify changes by running the dev server — there is no unit-test runner (E2E is Playwright).
