# Design system — where the values come from, and how assets get built

The look of this app is **ported, not authored**. Colours, type, spacing and component geometry
all come from one upstream source, and several files in this repo are **generated** from it. If
you hand-edit a generated file or hand-pick a hex, it will be silently wrong in one theme, or
silently missing in production.

Read this before touching `globals.css`, `shared/ui/`, icons, or anything brand-related.
[`CLAUDE.md`](../CLAUDE.md) has the short version; this is the reasoning and the runbook.

**Quick reference** — 1 [The source](#1-the-source) · 2 [`design-system/`](#2-the-design-system-folder)
· 3 [Icons](#3-icons) · 4 [Brand assets](#4-brand-assets) · 5 [Tokens](#5-tokens-in-globalscss)
· 6 [Screen surfaces](#6-screen-surfaces--the-single-panel-rule)
· 7 [Dialog dismiss](#7-dialog-dismiss--trailing-on-a-card-leading-on-a-screen)
· 8 [Runbook](#8-runbook) · 9 [Traps](#9-traps-that-have-already-bitten)
· 10 [Carousels and rows](#10-carousels-and-scrolling-rows--which-one-you-are-building)

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
| `icons.md` | The glyph names of the **first** export (554) — the Figma library now has 4626; `design-system/tevi-icons.svg` is the current list |

Values in that project are asserted against the Figma API (260/260 tokens, 4451/4451 geometry
checks). They are not a style guide to interpret — they are what the file says. Don't round them.

Five component families are **not ported**: date picker, breadcrumb, file upload, card media,
media player. Building one is new work — say so, don't present it as an existing component.

**The date picker is the one of those five the app has since had to build.** It is
`shared/components/calendar.tsx` — `react-day-picker` v10 dressed entirely in DS tokens, with every
visible string from `Intl` — plus the two controls over it, `DateField` (one date, in a popover) and
`DateRangeDialog` (a range, in a dialog). It lives in `shared/components/` and **not** `shared/ui/`
precisely because it is *not* a port: a file in `shared/ui/` claims a Figma node exists and that its
geometry was read off the file, and there is no node here. Read that component's own header before
touching it — two of its rules (never server-render it; the caption's `<select>` is an invisible
overlay) were found in the browser, not in the docs. If Figma ever draws one, the port replaces the
internals and the two controls keep their API.

---

## 2. The `design-system/` folder

Upstream assets that are **inputs to a build step, never served to a browser**.

```
design-system/
  tevi-icons.svg        60 MB, 4626 glyphs / 27 699 symbols — the Figma export, pristine
  tevi-icons.extra.svg  glyphs the Figma library does not carry (1: face-smile)
  tevi-logo.svg         the app mark
```

**`tevi-icons.extra.svg` is an overlay, not a second icon set.** `tevi-icons.svg` is replaced
wholesale on every re-export, so a glyph added inside it disappears the next time someone pulls
from Figma. `pnpm icons` merges the overlay over the export instead, which keeps the provenance
of every glyph legible: everything in the big file came from the Tevi Figma library, everything
in the small one did not. What may go in it is **upstream Zappicon v1.2.0 only** — the same set
the library itself was built from, so the geometry matches by construction rather than by eye.
Never hand-draw a path and never adapt a neighbouring glyph into the shape you need. Delete the
entry the day Figma ships the glyph; `icon-names.test.ts` fails if both files define the same id,
so a stale overlay entry cannot sit there quietly.

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

Browse all 4627 at **`/dev/icons`** (`pnpm dev`, dev-only, 404s in production): filter by name,
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

## 6. Screen surfaces — the single-panel rule

**The design system ships no page layout.** Figma draws components; how a screen arranges them, and
which plane they sit on, is this app's decision. So this is a *product* rule rather than a port — and
because it is not in any Figma file, it lives here.

### The rule

A **single-panel screen** — one form, one state, one list, anything that is a single block of content
in the 612 column — paints its surface differently at the two ends:

| | below `md` | from `md` |
|---|---|---|
| `<main>` and the sticky bar | `--background-surface` | `--background` |
| the panel | nothing: no background, no radius, no inset | the card: `md:rounded-xl md:bg-(--background-surface)` |
| filling the column | nothing — the boxes are already `flex-1` | `md:grow` |

One class, two places, both breakpoints:

```ts
export const X_SCREEN = 'bg-(--background-surface) md:bg-(--background)'
```

Put it on **`<main>` and on the sticky bar**, and on `loading.tsx` too. The bar needs it because
content scrolls *under* the bar — a page-coloured bar shows rows sliding past the title. `<main>`
needs it as well as the panel, or the area beneath a short panel stays page-coloured.

**Why:** on a phone the column is already the full width of the screen, so a card has nothing to be a
card *against*. What a phone should show is one uninterrupted plane from the status bar down; a card
there is a card drawn around the whole screen.

### The column carries no padding

The side inset belongs to the **content**, because it changes with the surface. Below `md` the screen
*is* the surface and the content is inset from the bezel — 16px, which for a list is already what
`ListRow`'s own `px-4` provides. From `md` the content sits inside a card and that same padding is the
card's inset. A `px-4` on the column doubles it at one end and is wrong at the other.

`PageBackBar` is handed the same column class, so the back button lines up with the content rather
than the window edge; the bar brings its own `px-4` below `md` and drops it at `md`, which is exactly
those two insets.

### Filling the column is `md:grow`, never a `min-height`

A `min-height` would have to subtract the bar (60), the column's padding, and below `md` the 84px the
tab bar reserves. Flex already knows all of that.

And below `md` the panel must **not** grow: the column there has a definite height and every box down
to the panel is `flex-1`, so growing it stops the column overflowing — the document stops scrolling
while its content is still taller than the space. Measured at 390×844.

### Reference pairs, and what is not aligned yet

| screen | constants | shape |
|---|---|---|
| `/redeem-gift-code` | `GIFT_CODE_SCREEN` + `GIFT_CODE_PANEL` | a form |
| `/my-wallet/payout-tracking` | `PAYOUT_SCREEN` + `PAYOUT_PANEL` | a list |
| `/my-wallet/transaction-history` | `MY_WALLET_SCREEN` + `MY_WALLET_PANEL` | a list |
| `/settings/custom-profile` | `PROFILE_SCREEN` + `PROFILE_PANEL` | a form |
| `/identification` | `IDENTIFICATION_SCREEN` + `IDENTIFICATION_PANEL` | a form |
| `/mcn-user-invitation/verify` | `MCN_INVITATION_SCREEN` + `MCN_INVITATION_PANEL` | a letter — **one pair, two routes**: the creator invitation is the same panel and shares both constants |

✅ **`IDENTIFICATION_PANEL` and `PROFILE_PANEL` were the two carrying an older treatment** — flat on
`--background` below `md`, i.e. the phone showed page colour and no surface at all, with an identical
`md:` card. **Aligned 2026-08-26**: they gained `IDENTIFICATION_SCREEN` and `PROFILE_SCREEN`, painted
on `<main>` and on each screen's own sticky bar. Measured at 390 and 1200: `#ffffff` / `#f4f4f5` at
both ends on both routes.

Neither has a `loading.tsx`, so there was no third place to paint — check for one when aligning
anything else, because a skeleton on the page colour under a surface-coloured screen is the visible
half of getting this wrong.

⚠ **And the skeleton's own blocks have to survive the ground they land on.** The mismatch this
section warns about is a *colour* mismatch; the one that actually shipped is worse and quieter — a
`--background-surface` placeholder on a surface-painted screen is not the wrong colour, it is
**invisible**, so the block silently stops being reserved and everything under it moves when the data
arrives. `MembershipDashboardSkeleton` draws its hero in the tier card's own tint for that reason.

✅ **`BarIconButton`'s disc was invisible on every screen this rule aligned.** The 40px disc every
sub-page bar wears is filled `--background-surface` — which is the bar's *own* colour below `md` on
any screen following this section, measured at **1.00** on `/my-wallet/transaction-history`,
`/redeem-gift-code` and `/identification`. The control read as a bare chevron, and it only ever looked
right on the page-coloured half of the rule. **Fixed 2026-09-09** in
`shared/components/bar-icon-button.tsx`, not per screen: the disc carries a
`--button-secondary-border` hairline, so it has its own edge instead of relying on a ground it cannot
predict from the call site. See §6a — this is that rule applied to the one component it kept catching.

| border token | bar `#ffffff` | bar `#f4f4f5` | bar `#18181b` | bar `#000000` |
|---|---|---|---|---|
| `--separator-default` | 1.27 | 1.15 | 1.19 | 1.41 |
| **`--button-secondary-border`** | **1.48** | **1.34** | **1.70** | **2.01** |

Short of 1.4.11's 3:1, and deliberately: that clause covers what *identifies* a control, which here is
the glyph (**19.9** Light / **17.7** Dark against the fill). The disc is shaping. A hairline heavy
enough to hit 3:1 against white is `--zinc-400`, which is a border nobody drew.

✅ **Superseded 2026-10-07: the disc is gone.** The hairline fixed visibility and kept the cost — three
outlined circles around a centred title, the heaviest thing in the bar. Every sub-page bar is opaque,
so the control never needed a ground of its own: `BarIconButton` is now **ghost at rest** (bare 24px
glyph in a 40px target, `--text-title` ≥17:1 on both grounds) and paints `--background-segment` only on
hover/press. Artwork is the one ground that still needs a plate, and the caller supplies it
(`PREMIUM_CONTROL_ON_HERO` on the Premium band). Loading states use `BarIconButtonSkeleton` — a
glyph-sized mark in the 40px box, not a 40px circle. Compared side by side at `/dev/bar-icon-button`.

The codebase is no longer mixed on this rule. If a screen turns up flat on `--background` below `md`,
it is either a **multi-block** screen (below) or it was missed.

### A screen with more than one block is **not** a single panel

`/my-wallet` and `/my-star` stack a balance card, an alert and three action rows above the ledger,
with page colour showing through the `gap-3` between them. **The rule above does not apply to them**,
and painting `<main>` with the surface there would be wrong rather than merely different: the action
rows are `--background-surface` themselves, so the gaps between the blocks would stop reading as gaps.

That arrangement is `web-app`'s (`tabCurrency/index.js` is a `Stack gap='12px'` of cards on an
ungutter'd container, and its own hero is a gradient, its options card `#FFFFFF`).

### …unless none of its blocks is a plain surface card

**The count of blocks is not the test.** Re-read the paragraph above: what makes the surface wrong on
`/my-wallet` is that the action rows *are* `--background-surface`, so painting the screen with it
dissolves the gaps. A multi-block screen whose blocks do not have that property has no such failure,
and then the phone gets what the top of this section says a phone should get — one plane from the
status bar down.

`/monetization/membership` is the worked example (`MEMBERSHIP_SCREEN` + `MEMBERSHIP_PANEL` +
`MEMBERSHIP_LIST_PANEL` in `features/monetization/lib/container.ts`). It stacks a tier card over a
members list and still paints every state's plane below `md`, because:

- the **tier card** is `--primary-50` inside a `--primary-300` hairline, so it reads as its own object
  against any ground and never needed page colour to separate it;
- the **members list** is the one block running to the bottom and is already `fullBleed`, so merging
  with the plane is the behaviour this section asks for rather than a lost gap. The panel's own
  `ListHeader` rule is what divides the two.

So the question to ask, in order:

1. **Is every block either tinted, outlined, or full-bleed to the bottom?** → paint the screen. The
   gaps were never carrying the separation.
2. **Is any block a plain `--background-surface` card floating in the column?** → page colour, and
   only the bottom-most block takes `fullBleed`. `/my-wallet` and `/my-star`.

Pinned in `e2e/wallet.spec.ts` for the second case, so "make the two wallet routes match" still fails
a test.

What those two screens *do* share with the rule is the panel's two ends. `LedgerPanel`'s **`fullBleed`**
makes the ledger full-bleed below `md` (`-mx-4 rounded-none`) and a card from `md` up — the same pair,
stated on the one block that runs to the bottom of the screen.

### …but its **empty** states still are

A multi-block screen with nothing to show has one block left — the wall — so §6's rule applies to
what remains, including the sentence under *Empty states inside a panel*: the state sits on the same
surface as the content it replaces. A wall floating on `--background` where three cards used to be
reads as a page that failed.

So such a screen owns **both** treatments and picks between them **by state**, not by route:

| state | `<main>`/column and the sticky bar | the block |
|---|---|---|
| has content | `--background` at both ends | cards, page colour in the gaps |
| empty · error · signed out | `X_SCREEN` (surface below `md`) | `X_PANEL` (the card from `md`) |
| loading | whatever the skeleton draws — **page colour** when the skeleton draws the cards | — |

The skeleton row is the one that is easy to get backwards: paint it like the empty state and a
returning reader watches the plane change colour under a skeleton that was already right.

`/mcn-partnership` (`MCN_PARTNERSHIP_SCREEN` + `MCN_PARTNERSHIP_PANEL`) and `/my-space`
(`MY_SPACE_SCREEN` + `MY_SPACE_PANEL`) are the two doing this today.

⚠ **This used to be driven by scroll position** (`fullBleedAtTop` + a `useStuckAtTop` hook, since
deleted): the card animated to full-bleed as it reached the sticky chrome. `web-app` drives it off the
**breakpoint** instead — the panel header is `#FFFFFF` below `md` and `#f4f4f4` from `md`
(`tabCurrency/transactionHistory/index.js`), with no scroll listener anywhere — so a rAF-per-scroll
hook was paying for a behaviour legacy does not have. Do not reintroduce it.

### A form is always painted, and always full width

The two questions under *…unless none of its blocks is a plain surface card* are for screens that
**display**. A screen that is nothing but fields — a
settings or setup form — never takes the page-colour branch, whatever its block count and whatever
its blocks are filled with. Below `md` it is painted and it runs edge to edge.

**Why:** the column's `px-4` plus each card's own `p-4` insets the content **twice** — 326px of usable
width on a 390px screen. On a screen whose entire content is fields, those 32px are the thing the
reader came for. `/monetization/donation` was first built as cards on page colour, which is correct by
question 2 and wrong by this one.

Four parts, and the third is the one that is easy to miss:

- **Paint the plane** below `md` — `X_SCREEN` on the sticky bar *and* the column.
- **Every block full-bleed**: `-mx-4 rounded-none md:mx-0 md:rounded-xl`, so its own `p-4` becomes the
  only gutter.
- **Separation moves from the gap to a hairline.** The form drops to `gap-0` with a `border-b` per
  block (`md:gap-3 md:border-b-0`). On a painted plane a surface-coloured block is not *mismatched*,
  it is **invisible** — so a block that stops relying on the gap has to be given something else.
- **The submit is a bar pinned to the bottom of the viewport, at every width** — `sticky bottom-0`,
  full-bleed below `md`, with the **button inside keeping the column's inset** (a button meeting both
  bezels is a bar, not a button; the *bar* is the thing that runs edge to edge). An in-flow Save left
  the primary action two screens below the last field on a phone. Four things it needs: `sticky` and
  never `fixed` (sticky keeps its space in flow, so nothing above is covered and no compensating
  padding can drift out of sync); an **opaque ground** matching `X_SCREEN`, because content scrolls
  under it; a **`border-t`**, the only thing separating it from that content while stuck — so the last
  block gives its own `border-b` up (`last-of-type:border-b-0`) or you get a 2px line; and the
  **column must drop its `pb-*`** for that view, or at the end of the scroll the bar un-sticks and
  hops up off the bottom edge. Keep `mt-auto md:mt-0` beside it: sticky does nothing when the content
  already fits, and `mt-auto` is what puts the bar at the foot in that case.

There is no separate rule below `sm` (612) — 16px is the DS's minimum gutter, and anything narrower
puts text on the bezel.

Reference: `DONATION_FORM_SECTION` + `DONATION_FORM_FOOTER` in
`features/monetization/lib/container.ts`, pinned by `e2e/monetization-donation.spec.ts` ("Save stays
pinned to the bottom") — because `sticky` dies **silently** the moment an ancestor gains
`overflow: hidden`. See §9.

### A brand-tinted ground needs its own ink token

`--background-brand` / **`--text-on-brand`** are a pair, and the pair exists because of a measured
failure. The ledger row's 40px disc is brand-tinted with a brand-inked glyph in it, and both halves were
first taken from tokens meant for the *page*: the disc from `--primary-200` (letting the rung invert on
its own) and the glyph from `--text-brand`.

In Dark that gave a **1.16:1 disc against the panel** — a circle that dissolved into `#18181b` — while
Light sat at 1.55 and looked correct. And raising the disc alone makes it worse, because `--text-brand`
is the glyph and the two converge: `primary-300` takes glyph-on-disc from 3.14 to 2.74, `primary-400` to
2.31. Both halves have to move together.

| | disc ↔ panel | glyph ↔ disc |
|---|---|---|
| Light — `primary-200` / `primary-500` | 1.55 | 5.98 |
| Dark — `primary-400` / `primary-700` | 1.57 | 4.99 |

**The general rule:** ink for a *tinted ground* is not the same token as ink for the page, even when the
two resolve to the same value in Light — which is exactly why this shows up in no light-mode screenshot.
Pinned by `e2e/wallet.spec.ts` ("the ledger row disc, in both themes"), which measures both ratios in
both modes; a single screenshot cannot state a claim about two.

### Two token traps

- **`--background-surface`, never `--background-subtle`.** Subtle resolves to `--zinc-100`, which *is*
  `--background` in Light (an invisible surface) and equals surface in Dark. Wrong in both modes, and
  it only shows when both are looked at. The exception is the dialog, where subtle *is* correct.
- **`overflow-clip`, never `overflow-hidden`,** on a panel with a sticky header inside it. `hidden`
  makes the panel a scroll container, so the sticky header resolves against a scrollport that never
  scrolls and simply stops sticking. See §9.

### Empty states inside a panel

An empty state is a single-panel screen's content, so it follows the panel's surface — and these
numbers, all of them legacy's:

- **title `type-body-strong` (16/600).** At 16/500 it sits at nearly the weight of the 14/400 sentence
  under it and stops reading as a title.
- **body `mx-auto max-w-[400px]`.** A sentence running the full width of a 612 card has to be tracked
  back across the whole block per line, and reads as a banner rather than a caption.
- **the state sits on the same surface as the content it replaces.** Floating on `--background` while
  the list it stands in for is a card reads as a page that *failed*, not one with nothing in it.
- **`art.width` is the drawn box, not the file's pixels.** `ChannelEmptyState` caps the image at
  `art.width`, so declaring a 2× asset's 380 renders it at twice Brand's size. Declare the drawn width
  and keep the source's aspect ratio — the component renders `h-auto`, so a height that fights the
  ratio only reserves a wrong box.

---

## 6a. A mark in a disc is the brand tint, and the ground is chosen against the surface

The app's treatment for a glyph in a disc is **`--background-brand` + `--text-on-brand`** —
`TwoStepVerificationDialog`, the ledger rows, and both credential screens (`/settings/password` and
`/settings/two-step-verification`, which share `PasswordStepHeader` and now its **default** tone). The
glyph is the sprite's **filled** drawing, so the mark reads as a solid silhouette.

A success confirmation still earns `success` (`PasswordDone`'s green check says something the brand
tint would not); the tone stays a per-screen choice, the brand pair is just what it defaults to.

⚠ The tint takes its **own** ink. `--text-on-brand` and `--text-brand` are the same value in Light
and diverge in Dark, so using the wrong one passes every check a Light-only review makes.

### Why a comp's neutral disc is not automatically portable

The two-step-verification comps draw a `#f4f4f4` disc with an `#a1a1a1` glyph, and the literal port of
that shipped first. `--background-subtle` is the token for `#f4f4f4` — and it is `--zinc-100`, from a
ramp that **inverts** between modes, so in Dark it resolved to `#18181b`: *exactly*
`--background-surface`, the card underneath. The disc was not faint, it was **gone** (measured
`rgb(24, 24, 27)` for both, ratio **1.00**), with the glyph floating on the card.

`--background-segment` repaired that much. The brand pair is better everywhere and, more importantly,
**symmetric** — which a neutral disc on a neutral card never was:

| | glyph on disc | disc on card |
|---|---|---|
| brand, Light | **5.98** | **1.55** |
| brand, Dark | **4.99** | **1.57** |
| neutral, Light | 4.16 | 1.16 |
| neutral, Dark | 6.49 | 1.06 |

Two rules fall out, and both cost nothing to follow:

- **A disc's ground is chosen against the surface it lands on**, not copied from the comp's hex. The
  same token is right in one place and invisible in another: `--background-segment` is 1.02 against
  the *dialog's* `--background-subtle` ground — invisible there — and fine against a card.
- **There is no neutral tint in the palette.** The accents ramp is indigo, error, success and warning
  only, so a neutral disc has `--background-segment` and nothing else; raw ramp values are not an
  option. If a mark needs to be *seen*, it wants the brand tint.

Screenshots do not catch any of this — in Light every version looks plausible. Reading
`getComputedStyle` does.

## 6b. The accent inks do not flip, and they are for marks

`--accents-*-active` are defined once and never redefined under `.dark`; only the `*-bg-active`
tints flip. So an accent ink's contrast is set by whatever it lands on, and a **sentence** in one is
weak in Light however it is placed:

| ink on | Light | Dark |
|---|---|---|
| `--text-error` `#ff3636` on the error tint | **3.29** | 4.74 |
| `--text-error` on a white card | **3.60** | 4.92 |
| `--text-title` on the success tint | **18.06** | high |

Note the tint reads *worse* than no tint in Light. Where a screen is free to choose, a tinted block
with `--text-title` is the pair that works (`TwoStepVerificationDialog`'s reset note,
`PayoutConfirmDialog`'s ETA strip). Where it is not — the auth feature's failure blocks are
`--text-error` on the error tint in `auth-error-message.tsx`, `forgot-password-flow.tsx` and the
two-step-verification screens — the consistency is worth more than the ratio, but the numbers are
here so the trade is a decision rather than an accident.

### The full sweep, for whoever decides this once

Every element on `/settings/two-step-verification` measured by computed style — 216 of them across
fifteen states × both modes (the script walks `main`, `[role="dialog"]` and the toast, resolves the
first opaque ancestor background, and applies WCAG's own thresholds: 3:1 for graphics and large text,
4.5:1 otherwise). **Ten fall short, and only three of those are Dark:**

| where | ratio | need | pair | whose |
|---|---|---|---|---|
| *Continue* while disabled | 1.84 L / 1.83 D | 4.5 | `--button-accent-*-disabled` | `shared/ui` — **exempt** (WCAG: inactive components) |
| *Confirm* on the destructive button | 3.60 L+D | 4.5 | `#ffffff` on `--accents-error-active` | `shared/ui` `Button` |
| `ConfirmDialog`'s description | 4.40 L | 4.5 | `--text-body` on the dialog ground | `shared/ui` |
| *Forgot passcode?* | 4.02 L / 4.41 D | 4.5 | `--text-link` on the card | repo-wide; underlined, so not colour-alone |
| failure line, bare | 3.60 L | 4.5 | `--text-error` on the card | comps draw it red |
| failure line, in a block | 3.29 L | 4.5 | `--text-error` on the error tint | the auth feature's pair |
| a **destructive text button** | 3.60 L / 4.92 D | 4.5 | `--text-error` on the panel | same pair as "failure line, bare" |
| the valid-address tick | 2.45 L | 3 | `--accents-success-active` on the field | decorative — see below |

None is a token that behaves differently between modes: they are all the **non-flipping accent inks**
meeting a light ground. That is the single decision to make, and it is not one to make screen by
screen — which is why nothing above was changed locally.

The last row was added by `/invitation/verify`, whose **Reject** is a `ghost` button on `--text-error`
— legacy's red text button, and the same ink `ActionMenuItem tone="destructive"` paints its rows with.
It is recorded here rather than fixed there **because a first pass did try to fix it there**: the red
was dropped for the ghost's default ink, which passes the ratio, diverges from the only other
destructive-text surface in the app, and leaves two irreversible answers distinguished by nothing but
their position in a stack. Exactly the per-screen deviation the paragraph above rules out. If the
decision goes the other way, it is one token and every surface in this table follows.

The tick is the one exception worth stating: it is `aria-hidden` and sits directly above
*"You're all set to continue."*, which says the same thing in text. 1.4.11 applies to graphics
**required** to understand the content, so a redundant mark is out of scope — and there is no passing
green in the palette anyway (`--accents-success-active` is the only success ink, and it does not
flip).

## 6c. Small text on a ported screen is 14, not 12

The two-step-verification views shipped every secondary line at `type-caption-meta` (**12px**) — the
failure line, the spam note, the resend countdown, *Forgot passcode?*. The comps put all of them at
**`14/Regular`**, and the links at **`14/Medium`** (`type-dense-default` / `type-dense-emphasis`).

Worth a rule because 12 is a plausible-looking choice for a "small" line and it is a whole step down
the ramp: at 12 the step's own feedback reads as a footnote to itself. Check the comp's `fontSize`
rather than reaching for the caption utility — the audit script above is how this was found, since
nothing about it looks wrong in a screenshot.

## 7. Dialog dismiss — trailing on a card, leading on a screen

The DS `Dialog` (50:15797) draws **no** close affordance. So every dialog invented its own, and the
answer to "why is the X on the right here and on the left there" is that the app has two different
dialog *shapes* and only one of them is a card. This is a product rule; do not look for it in Figma.

**A card → the glyph at the trailing edge.** The DS shell, title centred or ranged left, content in
flow. `DialogCloseButton` (`shared/components/dialog-close-button.tsx`) is the control — 40px target,
20px `xmark`, ghost, a disc — and it is the only one that should exist for this shape. Two ways to
place it, both already in use:

| Placement | Use it when | Inset |
|---|---|---|
| in flow, on a `justify-between` row with the title | the title is ranged left and can wrap | `-me-2 -mt-2` |
| `absolute`, last in the DOM | the title is centred, or the body owns the whole column | `end-2 top-2` |

Both put the *glyph* ~19–21px in from the dialog's trailing edge while the 40px target grows outward
into the shell's own `p-6`. **Last in the DOM matters**: base-ui focuses the first focusable element
on open, so a close written at the top means the thing focused when a dialog appears is the way out
of it, ring and all.

**A dialog that is really a screen → the glyph at the leading edge.** `DialogContent` with `p-0` plus
a 56/60px title band — a legacy full-screen or drawer ported into a popup: `CurrencyPicker`,
`PayoutMethodPickerDialog`, `PayoutMethodDetailDialog`, `StarPurchaseDialog`, `AddCardDialog`,
`CardCheckoutDialog`, `MembershipDetailDialog`, `NsfwAppealDialog`. That band **is** the mobile app
bar, and its start slot is where back/close lives, so the glyph goes there.

A dialog with **steps** keeps one shell and swaps its content — `StarPurchaseDialog`,
`NsfwInfoDialog`. Never close one dialog to open another for the same flow: measured, the handover
leaves a window with nothing on screen at all, and overlapping the two is worse. Where the step
change waits on a request, the wait goes **on the button** —
[`DEFINITION_OF_DONE.md` §1](DEFINITION_OF_DONE.md#a-press-that-decides-which-screen-comes-next-waits-on-the-button).

⚠ **This outranks a comp that disagrees.** `NsfwAppealDialog`'s Figma frames draw the ✕ at the
trailing edge — a native pushed screen's own convention — and it shipped that way for a day. Eight
dialogs teaching one place to look is worth more than any one of them matching its mock, and the
argument for making an exception ("this screen has no back step, so the glyph can only mean leave")
proves nothing: `StarPurchaseDialog`'s root step has no back step either.

`StarPurchaseDialog` is why this is structural rather than taste: the *same* start slot carries
`angle-left` when there is a step to go back to and `xmark` at the root step. Move the close to the
trailing edge and one control becomes two, in a dialog where the reader has to learn which of them
they are looking at.

Two things that hold on both shapes:

- **Logical properties only** (`start-*` / `end-*`). "Left" and "right" are leading and trailing, and
  they mirror under `ar` with no variant. `pnpm lint:rtl` fails the physical ones.
- **A dialog always has a visible way out.** Escape and the backdrop already dismiss, but neither is
  visible, and a touch reader has no way to discover them. Legacy ships nothing on its help dialogs;
  a glyph is the minimum. Where the dialog holds a *decision*, the footer button is the way out and
  pressing it **is** the decision — then the glyph is the secondary escape, not a duplicate.

---

## 8. Runbook

```bash
pnpm icons          # sprite subset + icon name types   (after changing either tevi-icons*.svg)
pnpm brand          # favicon + PWA icons               (after changing tevi-logo.svg)
pnpm fonts          # brand font → WOFF2                (after Brand ships a new Chella)
pnpm art            # rebuilds the committed illustrations (see below)
pnpm art:audit      # fails if any static image in src/ still points at another host
pnpm dev            # rebuilds the sprite subset first
pnpm build          # same
```

**Pulling a design-system update**: fetch the new file from the Claude Design project into
`design-system/`, run `pnpm icons` and/or `pnpm brand`, then `pnpm test`. Diff `globals.css`
against the project's `colors_and_type.css` by hand — token values are not generated.

**Re-exporting the icons from Figma** — the icon library is read straight off the `↳ Icons` page of
`Tevi Design system - Mobile` (`WVfz0MwBGyGt67LfNEY2pW`, 4613 component sets × 5 styles + 13 brand
marks), through the figma-console MCP's Desktop Bridge. 23 000 SVGs cannot travel back as tool
results, so the plugin POSTs them to a throwaway receiver on `http://localhost:9231` (a port in the
plugin's `allowedDomains`) that writes `part-*.json` into a scratch directory; then
`node scripts/import-figma-icons.mjs <dir> && pnpm icons`. The script's header holds every rule it
applies (names, the ~70 duplicate names, ink → `currentColor`, id prefixing, alias targets kept,
`premium` kept). Two traps in the export itself:

- **Restart the Desktop Bridge plugin first if a long session has been using it.** On 2026-10-08
  a stale plugin stalled every third sequential `await c.exportAsync()` until the 30 s timeout;
  after a restart, 100 sequential exports took 1.6 s. Parallel is faster either way —
  `Promise.all(children.map(c => c.exportAsync({ format: 'SVG_STRING' })))` over 6000 variants
  returns in ~2 s — so batch ~1200 sets per call, one `fetch` per batch.
- **A timed-out job is not dead.** The stalled loop resumes later and keeps POSTing — over a newer
  dump if it uses the same file names. Give every attempt its own file prefix, and have the
  receiver accept only that prefix.

Before committing, diff the rendered glyphs that already exist, not the bytes: Figma re-serialises
paths, so 44 of 1025 symbols differed by bytes on 2026-10-08 and 3 by drawing (`menu-bars`,
`more-horizontal` redrawn in Figma; `premium` turned into a 2.5 MB raster, hence `KEEP_PREVIOUS`).

Generated files are **committed** so a fresh clone typechecks without a build. That means they can
go stale, so tests regenerate in memory and compare:

| Test | Catches |
|---|---|
| `src/shared/ui/sprite.test.ts` | Forgot `pnpm icons`; dangling `<use>`; scan over-matching |
| `src/shared/ui/icon-names.test.ts` | Name union drifted from the sprite; truncated sprite; an overlay glyph Figma has since shipped |
| `src/shared/ui/sprite-weight-toggle.test.ts` | A `weight={cond ? 'filled' : undefined}` on a glyph whose bare id is an alias of that weight — draws the same thing twice |
| `src/app/manifest.test.ts` | Manifest icon with no file; scaffold favicon back; wrong theme colour |
| `src/shared/config/fonts.test.ts` | Forgot `pnpm fonts`; a `.ttf` committed back into `public/`; a weight re-added that the DS scale cannot reach |
| `src/features/*/lib/illustrations.test.ts` | An illustration the code names is missing, truncated, not the format it claims, or was pointed back at the CDN |

If one of these is red, the fix is almost always to run the generator and commit the result.

### The brand font

`pnpm fonts` compresses `design-system/fonts/Chella-Bold.ttf` into
`public/fonts/chella/Chella-Bold.woff2`. Same shape as the sprite: the input is not served, the
output is generated-but-committed, and a test fails if they drift.

**Why it is not the TTF Brand ships.** `next/font/local` self-hosts whatever file it is handed and
does not convert, so the format in `fonts.ts` is the format every visitor downloads — and
`font-brand` is on the splash screen, so that is every visitor. Measured: TTF 374 KB, 123 KB if the
server gzips it (not something this repo controls — a proxy that skips `font/ttf` serves all 374 KB),
**WOFF2 70 KB**, already compressed.

**Why one weight.** Brand ships Bold, ExtraBold and Black. The type scale is 400/500/600/700 — no
`.type-*` utility sets 800 or 900, and setting `font-weight` by hand is forbidden — so no conforming
markup could request the other two. They were 711 KB in the repo and in every deploy that nothing
could download, and they are gone. Adding one back starts with the **DS growing a weight**, not with
a `.ttf` reappearing in `design-system/fonts/` — which is why the test pins that folder's contents
too.

### Illustrations Brand ships as raster-in-SVG

> Full rule, budgets and inventory: **[`STATIC_ASSETS.md`](STATIC_ASSETS.md)**. What follows is the
> part that belongs to the asset pipeline; that doc is what to read before pointing a component at a
> CDN image.

**`pnpm art`** is a different kind of generator: its input is the **CDN**, not `design-system/`.
Brand exports some illustrations from Figma as an SVG *wrapping an embedded PNG*, and those files are
enormous for what they draw — `/redeem-gift-code`'s three were 1.8 MB, 1.6 MB and 600 KB, the last
two being a single **948×948** PNG inside a 190×127 box, and `campaign/logo-gyf.svg` was **2.27 MB**
to fill a 64px tile. `next/image` cannot help: it does not process a remote SVG, it passes one
through. (`dangerouslyAllowSVG` in `next.config.ts` is permission to *serve* one — hence the
`script-src 'none'; sandbox` CSP under it, because an SVG is a document that can carry script — not
permission to optimise it.)

So the scripts download them, rasterise at 2× the display box through the Playwright Chromium the
repo already has, and write WebP into `public/illustrations/<feature>/`. Same art, nothing redrawn.
The outputs are committed, like every other generated asset, so a build never depends on the CDN.

| script | covers |
|---|---|
| `scripts/build-cdn-art.mjs` (`pnpm art:cdn`) | the manifest-driven one — campaign, donation, identification, payment's scheme strip. **Add new art here**: one row in `SOURCES` |
| `scripts/build-gift-code-art.mjs`, `build-star-transfer-art.mjs` | the two per-feature scripts that came first |
| `scripts/build-payment-art.mjs` (`pnpm art:payment`) | GIF → animated WebP / h264. Needs `ffmpeg`, so it is not in `pnpm art` |
| `scripts/audit-cdn-art.mjs` (`pnpm art:audit`) | fails if **any** static image in `src/` still points at another host |

**When to reach for it**: always — no static art is fetched from a CDN any more, whatever it
weighs. A Brand SVG over ~20 KB is almost certainly a raster wrapper (check for `data:image/png`
inside it) and gets re-encoded; a genuine vector is copied byte for byte instead, because
rasterising it would cost crispness to save nothing.

**Two traps.** Encode at 2× the box the *component* caps the art to, not 2× the column it sits in —
the banner was 25% heavier than any screen could ask for until the cap and the encode agreed. And
after re-encoding, `rm -rf .next/dev/cache/images`: `minimumCacheTTL` is 31 days and the optimizer
caches by URL + width + quality, not by the file's mtime, so a running dev server keeps serving the
old bytes and the re-encode looks like it did nothing.

---

## 9. Traps that have already bitten

Each of these shipped once and produced **no error** — just a wrong pixel or a blank element.

- **Bare symbols in the sprite are aliases.** `<symbol id="angle-left"><use href="#angle-left--regular"/></symbol>`.
  Copy the alias without its target and the `<svg>` renders nothing, silently. The subset builder
  walks internal `<use>` references transitively; `sprite.test.ts` guards it.
- **…and 67 of those aliases point at `--filled`, so the glyph has one drawing, not two.**
  `<symbol id="eye"><use href="#eye--filled"/></symbol>` — `icons.md` spells this out as
  `eye *(filled only)*`. `weight={active ? 'filled' : undefined}` on such a glyph resolves to the
  same paths in both states: no error, no blank box, just a control that never changes. That
  shipped in the password field's reveal button, where it read as a dead toggle — worst on
  `settings/password`, whose field starts empty, so the masked dots were not there to change
  either. Check `icons.md` before making a weight carry state; `sprite-weight-toggle.test.ts`
  fails the build on it. Two states need two glyphs, and if the second one is not in the library,
  it comes from `tevi-icons.extra.svg` (§2) — not from a path you drew.
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

---

## 10. Carousels and scrolling rows — which one you are building

The design system draws neither, so both are app-authored, and the two get confused because they
look alike in a screenshot. **Pick by semantics, not by looks.**

| | **Carousel** | **Scrolling row** |
|---|---|---|
| Shape | one card fills the viewport | many small items, several visible |
| Vocabulary | slide, dots, "go to slide 3", autoplay | "there is more this way" |
| Built with | **Embla** via `shared/components/card-carousel.tsx` | native `overflow-x-auto` + `snap-x` |
| Position lives in | the engine (`selectedScrollSnap()`) | the DOM (`scrollLeft`) |
| Today | campaign banners, Premium benefits | share sheet's channel discs, legal TOC, the two following strips |

### Carousel → `CardCarousel`, never Embla directly

`embla-carousel-react` is imported in **one file** and that is deliberate: it keeps the geometry,
the a11y wiring (`aria-roledescription="carousel"` / `"slide"`), the dots' 24px targets, the
autoplay pause rules and the RTL handling in one place rather than per call site.

```tsx
<CardCarousel label={t('…')} slideLabel={(i, n) => t('…', { i, n })} autoplayMs={0}>
    <SlideA />
    <SlideB />
</CardCarousel>
```

- **Autoplay is hand-written, not `embla-carousel-autoplay`.** Four things hold it — hover,
  focus-within, a hidden tab, and `prefers-reduced-motion: reduce` (which switches it off entirely
  rather than making it jump). WCAG 2.2.2 wants a way to stop moving content and a resting pointer
  *is* that way; the plugin covers two of the four.
- **Prev/next are the caller's to place.** The component renders dots and nothing else; take its
  `ref` (`prev` / `next` / `goTo`) and `onIndexChange`. `PremiumBenefitDialog` needs its arrows
  *outside* the dialog, where a control rendered inside could never reach.
- **One slide short-circuits.** `count === 1` renders the lone child bare — no track, no dots, no
  engine. The common case in production is exactly one campaign running, so that path is the hot one.

### Row → the platform, and Embla is the wrong tool

Embla translates a track. A row of `<button>`s scrolled that way loses three things the browser was
doing for free, and none of them fails loudly:

1. **The browser scrolls a focused child into view.** Tab to the seventh chip in a transform track
   and focus goes somewhere off-screen. (Embla's `watchFocus` covers this *inside* a carousel,
   where the slide is the focus target; in a row the target is one of twenty small children.)
2. **Momentum and rubber-band on iOS**, plus `overscroll-behavior: contain` to stop a horizontal
   swipe becoming the browser's back gesture.
3. **Horizontal trackpad wheel.** Native scrolling gets it; Embla needs a plugin.

So a row stays on `overflow-x-auto` + `snap-x`. The four things that make one look finished rather
than hand-rolled are in `features/share/components/share-dialog.tsx` (`ChannelRow`), and each of
them was arrived at by rendering the alternatives, not by reasoning:

1. **The edges are a `mask-image` on the scroller, not a scrim painted over it.** A scrim has to
   match the surface underneath exactly — which made the share sheet override the DS dialog's own
   fill, and still left a faint seam where "sheet colour" met sheet colour. A mask dissolves the
   items themselves: nothing to colour-match, no seam, and it works on any ground.
2. **The fade is 24px — a hint, not a hiding place.** It was 60, then 40, then a cover measured to
   the nearest column gap, all in service of hiding the item *under* an always-visible arrow. Once
   the arrow stopped reserving space that whole problem went away: at 24px the fade only softens the
   cut, and what a scroll boundary looks like mid-item is what every shelf on the web looks like.
   (What looked broken before was a half-dissolved disc sitting *beside* an opaque control in an
   empty pocket — the pocket was the fault, not the dissolve.)
3. **The arrows are revealed by the row's `group-hover` / `group-focus-within`, and reserve no
   space.** They were always-visible for three iterations, and each one paid for it: an arrow
   standing on a row needs the item behind it hidden, hiding an item means masking a whole column,
   and a 104px pocket holding a 36px control reads as a layout mistake — a quarter of the row, on a
   dialog whose job is to show seven icons. Revealed on hover they sit *over* the content with a
   shadow, and the row is seven columns wide at every width. Touch gets none of them on purpose: a
   swipe is the gesture people already have there, and the edge fade is what says there is more.
   `focus-within` as well as `hover`, or the row's seven buttons tab into something invisible.
   `inert` at the end it points at, and `pointer-events: none` until revealed — otherwise an
   invisible disc swallows the press meant for the icon under it. **A suite has to `hover()` the
   row before pressing either arrow**, or the click times out on "the row intercepts pointer
   events".
4. **A press moves whole items** (a stride measured off the first child, so it survives a label
   wrapping to two lines), and **snap points** mean a drag settles on an item too.

The arrow itself is `--background-elevated` — the token for something floating over a surface. Not
`--background-surface`: in Dark that *is* the sheet (`#18181b`), so the disc vanished and left a
1px ring, and the shadow that lifts it in Light does nothing on near-black.

### Traps

- **Direction is read from *layout*, not from the locale.** `dir` is inherited, so any subtree can
  flip it — `/dev/campaign-carousel` renders the same carousel inside `dir="ltr"` and `dir="rtl"`
  side by side to compare them. Embla is told which way the track runs by
  `getComputedStyle(embla.rootNode()).direction` in an effect, and re-initialised handing back the
  slide that is showing (a language switch must not also be a page turn). A locale-derived answer
  makes that harness lie about the one thing it exists to show.
- **`scrollLeft`'s sign in an RTL container is a browser-history minefield** — negative in current
  Chrome/Firefox/Safari, `scrollWidth`-based in older WebKit. Every hand-rolled row here measures
  `Math.abs(scrollLeft)` against `scrollWidth - clientWidth` instead, which needs no `dir` branch.
- **Measure a carousel after it has settled.** Embla eases to its target, so a Playwright assertion
  700ms after a dot press reads a transform 4px short and looks like a snap bug. It is not: at 2.5s
  it lands exactly. Wait for the position, don't sleep a guess.
- **jsdom cannot run the engine.** Embla needs `ResizeObserver` *and* `IntersectionObserver`, and
  every element measures 0×0 — so a unit test can only cover the branches taken before the engine
  starts (the empty and single-slide short-circuits, the dots switch, the ARIA wiring).
  Anything about *position* belongs in a browser: `/dev/campaign-carousel` and `/dev/premium`.
- **Weight, for the record:** Embla is 11.1 KB gzipped (`embla-carousel` 8.6.0 ESM, measured) plus
  0.5 KB for the React wrapper. Legacy's Swiper is ~40 KB gzipped for the same job once
  `swiper-core`, the React wrapper, `navigation`, `free-mode` and two CSS files are counted — which
  is why five components were written against the platform before this one library arrived.
