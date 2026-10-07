/**
 * Layout rules a back-button bar shares, written once so the dozen bars that compose `AppBar` by hand
 * (and their `loading.tsx` twins) cannot each pick a different version.
 *
 * Its own file without `'use client'`, so a route's loading chunk can import it.
 */

/**
 * **The bar title stays centred on the bar below `md`** — product's rule — and is capped so it clears
 * the wider of the two side clusters on both sides, truncating inside that.
 *
 * Below `md` a bar that carries the Star pill after the back button (`PageBackBar starBalance` — a
 * post) has a leading cluster ~150px wide, wider or narrower with the figure. `BarTitleReserve` (a hidden child of the bar) measures
 * the clusters and sets `--bar-title-reserve` on the bar; the fallback (168 = back 40 + gap 8 + a
 * six-digit pill ~112 + 8 of air) covers the server render, before anything has been measured.
 *
 * `max-md:px-0` drops `AppBarTitle`'s own 16px a side: the reserve already carries 8px of air, and
 * in a cap this tight those 32px were a quarter of the title's room.
 *
 * `max-md:px-0` drops `AppBarTitle`'s own 16px a side: the reserve already carries 8px of air, and
 * in a cap this tight those 32px were a quarter of the title's room.
 *
 * (It was briefly in the flow instead — more room for the title, but centred in the gap rather than
 * on the bar, and product rejected that.)
 */
export const BAR_TITLE_RESERVE_BELOW_MD =
    'max-md:max-w-[calc(100%-2*var(--bar-title-reserve,168px))] max-md:px-0'
