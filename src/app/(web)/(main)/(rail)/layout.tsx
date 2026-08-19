import { AppEndRail } from '@features/navigation'

/**
 * The routes that get the desktop **end rail** — legacy's "Trending" column.
 *
 * That is every product surface: home, a channel, my space, the wallet screens, settings,
 * identification. What sits outside this group is the six **wide documents** — the policies,
 * the community guidelines, moderation and brand assets — and the reason is geometry, not
 * category.
 *
 * The rail is pinned on the assumption of a **612** content column: it starts 22px past that
 * column's trailing edge (`--end-rail-anchor`, whose arithmetic is in `globals.css`). Every route
 * in here caps at 612 — `CHANNEL_CONTAINER`, `MY_STAR_CONTAINER`, `IDENTIFICATION_CONTAINER` and
 * the rest are all the same number. The excluded six do not: `LEGAL_CONTAINER` is 1080 and
 * `BRAND_CONTAINER` is 900, so the rail would land **on top of the text** at any window between
 * the 1292 gate and roughly 1760.
 *
 * Legacy answers the same question with a seven-entry pathname blocklist checked on every render
 * (`HIDE_TRENDING_ROUTES` in `layouts/protected`). This is that rule expressed as a directory, so
 * nothing inspects a pathname and a new route's answer is decided by where someone puts the file
 * — which is how every other piece of chrome in this app is decided
 * (see `(main)/layout.tsx`).
 *
 * **Adding a route**: if its column is 612, it belongs in here. If it is wider, it belongs beside
 * the documents — or the rail needs a wider gate before it can join.
 *
 * The rail renders after `children` and is `position: fixed`, so it takes no part in flow and this
 * layout adds no wrapper. The URLs are untouched: `(rail)` is a route group.
 */
export default function RailLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <AppEndRail />
        </>
    )
}
