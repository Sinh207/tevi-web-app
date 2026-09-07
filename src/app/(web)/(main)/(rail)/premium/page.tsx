import { PREMIUM_SCREEN, PremiumView } from '@features/premium'
import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import type { Metadata } from 'next'

/**
 * `/premium` — what Tevi Premium costs, what it unlocks, and how to subscribe.
 *
 * Reached from three places in the shell (the drawer's POWER-UPS row, the mobile top bar's badge and
 * the desktop end rail's promo card) and from the mobile app's own links. The address is legacy's,
 * unchanged — see `features/premium/routes.ts`.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own bar instead of the
 * global mobile top bar, like `/my-star` and `/redeem-gift-code`. The group a route joins is what
 * decides its chrome, which is why nothing here inspects the pathname. It is in `(rail)` because its
 * column is 612 — the width the desktop end rail is pinned against.
 *
 * ## The page is a `<main>` and a colour, and that is all it can be
 *
 * Every part of this screen is client code, and it has to be. Three of its four sections are reads
 * as this bearer and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`); the **bar** is client too, because it is transparent over the brand
 * band until it is stuck and that is a scroll position (`PremiumTopBar`). What the server still
 * renders is the document, the title in `<head>`, and — because a client component is server-rendered
 * too — the bar's `<h1>` and the hero's copy in the reader's own language on the first paint.
 *
 * ## `index, follow`, unlike every other account screen
 *
 * This one is **marketing**: legacy sets `robots: 'index, follow'` on it explicitly (its only
 * non-legal page that does) and lists it in the sitemap, because it is a page people should be able
 * to find. `/my-star`, `/identification` and `/redeem-gift-code` are `noindex` for the opposite
 * reason — they are account actions. Nothing on this page is per-account until it hydrates.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('premium_title'),
        description: t('premium_meta_description'),
        alternates: { canonical: '/premium' },
        robots: { index: true, follow: true },
    }
}

export default function PremiumPage() {
    return (
        <main className={cn('flex flex-1 flex-col', PREMIUM_SCREEN)}>
            <PremiumView />
        </main>
    )
}
