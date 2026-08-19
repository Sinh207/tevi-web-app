# Design system — where the values come from, and how assets get built

The look of this app is **ported, not authored**. Colours, type, spacing and component geometry
all come from one upstream source, and several files in this repo are **generated** from it. If
you hand-edit a generated file or hand-pick a hex, it will be silently wrong in one theme, or
silently missing in production.

Read this before touching `globals.css`, `shared/ui/`, icons, or anything brand-related.
[`CLAUDE.md`](../CLAUDE.md) has the short version; this is the reasoning and the runbook.

**Quick reference** — 1 [The source](#1-the-source) · 2 [`design-system/`](#2-the-design-system-folder)
· 3 [Icons](#3-icons) · 4 [Brand assets](#4-brand-assets) · 5 [Tokens](#5-tokens-in-globalscss)
· 6 [Runbook](#6-runbook) · 7 [Traps](#7-traps-that-have-already-bitten)

---

## 1. The source

**Claude Design project "Tevi Design System — Figma 1:1"** — `5a7f74d2-f2f7-4926-b50d-253edc777ad5`,
itself ported 1:1 from Figma file `WVfz0MwBGyGt67LfNEY2pW` ("Tevi Design system - Mobile").

Read it with the `DesignSync` tool (Claude Code), or open
`https://claude.ai/design/p/5a7f74d2-f2f7-4926-b50d-253edc777ad5`. You need design-system access on
your claude.ai account; if `list_projects` doesn't show it, that's a permissions problem, not a
missing project.

What's in there and when you want it:

| File | Use it for |
|---|---|
| `README.md` | The rules. Short. Read first. |
| `components.md` | Generated HTML API: root class, data attributes, allowed values |
| `preview/<name>.html` | **The real markup for each component — copy from here** |
| `colors_and_type.css` | Every token, both themes — what `globals.css` mirrors |
| `icons.md` | The 554 glyph names |

Values in that project are asserted against the Figma API (260/260 tokens, 4451/4451 geometry
checks). They are not a style guide to interpret — they are what the file says. Don't round them.

Five component families are **not ported**: date picker, breadcrumb, file upload, card media,
media player. Building one is new work — say so, don't present it as an existing component.

---

## 2. The `design-system/` folder

Upstream assets that are **inputs to a build step, never served to a browser**.

```
design-system/
  tevi-icons.svg    1.6 MB, 554 glyphs / 1579 symbols
  tevi-logo.svg     the app mark
```

Nothing here reaches the client. Everything shipped is generated from it:

```
design-system/            (source, committed, never served)
        │
        ├── scripts/build-icon-sprite.mjs    → public/tevi-icons.<hash>.svg
        │                                      src/shared/ui/sprite.ts
        ├── scripts/generate-icon-names.mjs  → src/shared/ui/icon-names.ts
        └── scripts/generate-brand-assets.mjs → src/app/icon.svg, favicon.ico,
                                                apple-icon.png, public/icons/*
```

**Why not `public/`** — anything there is served verbatim and shipped in the deployment. The
sprite lived there once: 1.6 MB of dead weight in every deploy, and with no content hash in the
filename Next served it `Cache-Control: max-age=0`, costing a revalidation round-trip per
navigation.

**Why not `src/`** — someone would `import` it and webpack would inline 1.6 MB into a JS bundle.
It also isn't code, so it has no business going through Biome or `tsc`.

The only runtime reader is the dev-only route
[`/dev/icons/sprite`](../src/app/(web)/dev/icons/sprite/route.ts), which streams the full sprite to the
gallery page and 404s in production.

---

## 3. Icons

### Using one

```tsx
import { Icon } from '@shared/ui/icon'

<Icon name="angle-left" size={20} className="text-icon-secondary" />
<Icon name="heart" weight="filled" size={24} />
```

Glyphs paint with `currentColor` — set the colour on the element. Tevi uses **16 / 18 / 20 / 24**
depending on the host component.

Browse all 554 at **`/dev/icons`** (`pnpm dev`, dev-only, 404s in production): filter by name,
switch weight and size, click a tile to copy its name.

**Weights are typed per glyph.** Figma drew `filled` for 519 glyphs but `light` for only 5, so
`<Icon name="star" weight="light" />` is a **type error**, not a blank `<svg>`. If the glyph you
want doesn't exist, say so — never substitute a similar shape, never hand-draw a path.

### How it ships

`scripts/build-icon-sprite.mjs` scans `src/` and emits only the glyphs referenced, as a
content-hashed file that [`next.config.ts`](../next.config.ts) serves `immutable`. It runs
automatically on `pnpm dev` and `pnpm build`.

Measured on a 20-icon screen, production build:

| | Full sprite | Subset |
|---|---|---|
| Over the wire | 360 KB gzip | **6.4 KB** |
| Icon visible, fast network | 221 ms | **93 ms** |
| Icon visible, 400 kbps / 400 ms RTT | **7 668 ms** | **568 ms** |

Two scan passes, because either alone misses real usage:

1. every `<Icon …/>` tag — pairs `name` with the `weight` on the same tag;
2. any standalone quoted token matching a glyph name — covers arrays, maps and props feeding a
   dynamic `name={…}`. Deliberately over-inclusive; a stray match costs ~1 KB.

A name **assembled at runtime** (`'arrow-' + dir`) is invisible to both. Add it to the `KEEP` list
at the top of the script, with a reason.

### Duotone glyphs: two custom properties

A glyph arrives as `<use href="…#id">`, and the clone lives in a **shadow tree — no stylesheet
rule can reach the paths inside it**. Only inherited properties cross that boundary, and `opacity`
is not one. So the 9 symbols that carry an `opacity` (the duotones) are rewritten as they are
subsetted, swapping the two hard-coded values for `var()` with the original as the fallback:

| | Controls | Default |
|---|---|---|
| `--tevi-icon-tint` | opacity of the tint path | `0.4` |
| `--tevi-icon-detail` | fill of the detail paths | `currentColor` |

Set them on any ancestor. Unset, rendering is byte-identical to the raw symbol — which is why
`/dev/icons` and every existing call site were unaffected when this landed.

The Tab Bar is what needs them: Figma takes the tint to full strength there and repaints the
detail layer White as a knockout, per icon (`house-heart` and `comment-dots` yes,
`user-heart-alt` no). See `shared/ui/tab-bar.tsx`.

**Don't reach for a CSS selector on `svg path` to restyle a glyph** — it will silently do nothing.
Either the value already has a hook, or add one in `duotoneHooks()` in the build script.

**Adding an icon you haven't used before requires restarting `pnpm dev`** — the subset is built at
startup. This is deliberate: dev and prod load the same subset, so a missing glyph shows up while
you're building the screen instead of only after deploy.

---

## 4. Brand assets

```tsx
import { Logo } from '@shared/ui/logo'

<Logo size={48} />
```

The DS app mark: rounded square r12, `--primary-500` + `--white`, used at 48 (navbar) and 32
(left-bar tile). It is **not in the icon sprite** — fixed colours, no `currentColor`, and it does
not flip with the mode (`--primary-500` is the one ramp step that doesn't invert).

**There is no wordmark in the design system.** The "Tevi" lettering in the app is live text in the
Chella brand font, not an asset. If a design needs a real wordmark, that's a request to design,
not something to draw here.

Favicon and PWA icons are rendered from `design-system/tevi-logo.svg` by **`pnpm brand`**. Outputs
are committed so neither `pnpm dev` nor CI needs a browser:

| Output | |
|---|---|
| `src/app/icon.svg` | Favicon, vector |
| `src/app/favicon.ico` | 16/32/48, PNG payload — for clients that ignore SVG favicons |
| `src/app/apple-icon.png` | 180×180, iOS home screen |
| `public/icons/icon-192.png`, `icon-512.png` | PWA |
| `public/icons/icon-maskable-512.png` | PWA, **rendered separately** |

The maskable variant is not a resize. Android crops maskable icons to a circle or squircle, so it
is drawn full-bleed with the mark inside the 80% safe zone; a resized rounded square loses its
corners.

Adding an entry to `src/app/manifest.ts` **only ever alongside a real file** —
[`manifest.test.ts`](../src/app/manifest.test.ts) asserts every `icons[].src` exists on disk.

### Not to be confused with the press kit

Two different things share the name. This section is the **app's own** icons, generated from
`design-system/tevi-logo.svg`. The **press kit** — what creators download from `/brand-assets` — is
unrelated artwork that Brand authored elsewhere and that this repo only *serves*:

| Path | |
|---|---|
| `public/download/logo_pack.zip`, `buttons_support.zip` | The archives, at legacy's URLs — kept so the same-origin cutover doesn't break them |
| `public/brand-assets/buttons/*.png` | The 9 button images, extracted from the archive so each can be downloaded on its own |
| `${STATIC_DOMAIN}/web/web-landing/brand-assets/logo-{1,2,3}.svg` | The lockup previews, still served from the CDN |

None of it is generated, so **`pnpm brand` will not reproduce it** — it is copied in by hand when
Brand ships a new kit, and the button PNGs must be re-extracted from the new archive at the same
time so the single-file downloads keep matching the pack.
[`brand-assets.test.ts`](../src/features/brand-assets/content/brand-assets.test.ts) checks the files
exist and that each PNG's declared size is the file's own.

---

## 5. Tokens in `globals.css`

Names and values mirror the DS `colors_and_type.css` **verbatim**, so markup copied out of
`preview/*.html` renders correctly here. Don't rename a token.

- **Semantic tokens only.** The Zinc and Primary ramps *invert* between modes — `--zinc-950` is
  `#09090b` in light and `#fafafa` in dark. Use `--text-title`; never `--zinc-950`, never a hex.
- **Typography**: the 25 `.type-*` utilities, one per Figma text style. Never set `font-size` /
  `font-weight` by hand, and don't reintroduce a Tailwind `--text-*` size scale — `--text-body` is
  already a *colour* token, the two namespaces collide.
- **Shadows** `shadow-xs…3xl` + `shadow-label`, **blur** `--blur-sm/md/lg` for `backdrop-filter`.
  Both flip with the theme.

### ⚠ Spacing indices are not Tailwind indices

The Figma ramp isn't linear. `--spacing-5` is **24px**; Tailwind `p-5` is **20px**.

| Figma | px | Tailwind |
|---|---|---|
| `--spacing-0…4` | 0 4 8 12 16 | `p-0` … `p-4` — same |
| `--spacing-5` | 24 | **`p-6`** |
| `--spacing-6` | 32 | `p-8` |
| `--spacing-7` | 40 | `p-10` |
| `--spacing-8` | 48 | `p-12` |
| `--spacing-9` | 64 | `p-16` |
| `--spacing-10` | 80 | `p-20` |
| `--spacing-11` | 96 | `p-24` |

The `--spacing-*` vars exist so copied DS CSS works. They are deliberately **not** registered in
`@theme` — doing so would make `p-6` mean 32px and break every Tailwind habit in the codebase.
Reading a Figma spec that says "spacing 5"? Use `p-6`.

---

## 6. Runbook

```bash
pnpm icons    # sprite subset + icon name types   (after changing tevi-icons.svg)
pnpm brand    # favicon + PWA icons               (after changing tevi-logo.svg)
pnpm dev      # rebuilds the sprite subset first
pnpm build    # same
```

**Pulling a design-system update**: fetch the new file from the Claude Design project into
`design-system/`, run `pnpm icons` and/or `pnpm brand`, then `pnpm test`. Diff `globals.css`
against the project's `colors_and_type.css` by hand — token values are not generated.

Generated files are **committed** so a fresh clone typechecks without a build. That means they can
go stale, so tests regenerate in memory and compare:

| Test | Catches |
|---|---|
| `src/shared/ui/sprite.test.ts` | Forgot `pnpm icons`; dangling `<use>`; scan over-matching |
| `src/shared/ui/icon-names.test.ts` | Name union drifted from the sprite; truncated sprite |
| `src/app/manifest.test.ts` | Manifest icon with no file; scaffold favicon back; wrong theme colour |

If one of these is red, the fix is almost always to run the generator and commit the result.

---

## 7. Traps that have already bitten

Each of these shipped once and produced **no error** — just a wrong pixel or a blank element.

- **Bare symbols in the sprite are aliases.** `<symbol id="angle-left"><use href="#angle-left--regular"/></symbol>`.
  Copy the alias without its target and the `<svg>` renders nothing, silently. The subset builder
  walks internal `<use>` references transitively; `sprite.test.ts` guards it.
- **Tailwind inlines shadow values.** A plain `@theme { --shadow-md: … }` freezes the light ramp
  into the utility, so `shadow-md` never darkens. Shadows go through `--elevation-*` +
  `@theme inline` so the utility emits a `var()`. Don't "simplify" that indirection.
- **`notFound()` returns HTTP 200** on a dynamic route — the body is the 404 page but the status
  isn't. `/dev/*` is blocked in [`proxy.ts`](../src/proxy.ts) for a real 404.
- **A manifest can point at a file that doesn't exist** and nothing complains; the PWA just
  installs with a blank icon. That was true here for months (`/icon.png`).
- **Token name collision.** `--text-body` is a colour. A Tailwind `--text-*` font-size scale
  overlaps that namespace.
- **`public/` files get `max-age=0`** unless the filename is content-hashed and given explicit
  headers.
- **`pnpm build` does not exercise `pnpm dev`.** The build is pinned to webpack; the dev
  server runs Turbopack, which is stricter about assets. A `favicon.ico` whose PNG payloads
  were RGB instead of RGBA passed the build and broke `next dev` outright. After touching a
  binary asset, start the dev server too — a green `pnpm build` proves nothing about it.
