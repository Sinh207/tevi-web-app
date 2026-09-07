import { GIFT_PREMIUM_SCREEN, GiftPremiumView } from '@features/premium'
import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import type { Metadata } from 'next'

/**
 * `/gift-premium` — buy Tevi Premium for somebody else.
 *
 * The address is legacy's, unchanged (`pages/gift-premium`), so the links already in the wild keep
 * working and `proxy.ts` needs no redirect — see `features/premium/routes.ts`.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own bar instead of the
 * global mobile top bar, like `/premium` and `/my-star`. The group a route joins is what decides its
 * chrome, which is why nothing here inspects the pathname. It is in `(rail)` because its column is
 * 612 — the width the desktop end rail is pinned against.
 *
 * ## The page is a `<main>` and a colour, and that is all it can be
 *
 * Every part of this screen is client code and has to be. The recipient search, the gift catalogue
 * and the checkout are all reads and writes as this bearer, and there is no SSR bearer in this app
 * by construction (`shared/lib/api/token.ts`); the bar is client too, because it is transparent over
 * the brand band until the band scrolls past, which is a scroll position. What the server still
 * renders is the document, the title in `<head>`, and — because a client component is
 * server-rendered too — the bar's `<h1>` and the invitation copy in the reader's own language on the
 * first paint.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * Legacy sets exactly this (`robots: 'noindex, nofollow'` in its `getStaticProps`), and it is right:
 * the page is an account action whose whole content is a picker over other people's spaces. It stays
 * *crawlable* for the reason `/redeem-gift-code` and `/my-star` both write down — a disallowed URL
 * is one a crawler never fetches, so it never reads the `noindex` either, and a URL that can be
 * shared can still surface as a bare address. Crawlable + `noindex` is the combination that actually
 * keeps it out of the index.
 *
 * That is also the one place it differs from `/premium`, which is `index, follow` because it is
 * marketing. This one is not: it names a recipient.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('giftpremium_title'),
        description: t('giftpremium_meta_description'),
        alternates: { canonical: '/gift-premium' },
        robots: { index: false, follow: false },
    }
}

export default function GiftPremiumPage() {
    return (
        <main className={cn('flex flex-1 flex-col', GIFT_PREMIUM_SCREEN)}>
            <GiftPremiumView />
        </main>
    )
}
