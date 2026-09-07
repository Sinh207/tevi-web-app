import { GIFT_CODE_CONTAINER, GIFT_CODE_SCREEN, RedeemGiftCodeView } from '@features/gift-code'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/redeem-gift-code` — enter a gift code or gift card and see what it contained.
 *
 * Reached from the account drawer's REWARDS row, and from the URL printed on gift cards and pasted
 * into support replies: the address is legacy's, unchanged, which is why `proxy.ts` needs no redirect
 * for it (see `features/gift-code/routes.ts`).
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar, like `/my-star` and `/identification`. The group a route joins is what
 * decides its chrome, which is why nothing here inspects the pathname. It is in `(rail)` because its
 * column is 612 — the width the desktop end rail is pinned against.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * A redemption is a write as this bearer, and there is no SSR bearer in this app by construction
 * (`shared/lib/api/token.ts`). So the server renders the shell, the bar and the title — which is what
 * makes the screen appear instantly and be readable by a crawler — and the form works after
 * hydration. Nothing here is fetched on arrival at all: the page asks the backend nothing until
 * somebody presses the button.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * The page itself is generic marketing-adjacent copy, but it is an account action with a form on it
 * and legacy marks its equivalent the same way. The reason it stays *crawlable* is the one
 * `/identification` and `/my-star` both write down: a disallowed URL is one a crawler never fetches,
 * so it never reads the `noindex` either — and a URL linked from a row in the account drawer on every
 * screen can still surface as a bare address. Crawlable + `noindex` is the combination that actually
 * keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('giftcode_title'),
        description: t('giftcode_body'),
        alternates: { canonical: '/redeem-gift-code' },
        robots: { index: false, follow: false },
    }
}

export default async function RedeemGiftCodePage() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${GIFT_CODE_SCREEN}`}>
            {/*
             * Opaque and sticky: the content scrolls under the bar, so a transparent one would show
             * the form sliding past the title. The colour is `GIFT_CODE_SCREEN`'s, the same class
             * `<main>` carries — below `md` that makes the bar part of the surface rather than a
             * band of page colour above it, which is the whole point of the phone treatment. No
             * hairline: from `md` the card below brings its own edge, and below `md` there is
             * nothing to separate.
             */}
            <div className={`sticky top-0 z-20 ${GIFT_CODE_SCREEN}`}>
                <PageBackBar title={t('giftcode_title')} className={GIFT_CODE_CONTAINER} />
            </div>
            {/*
             * `pb-6` and no top padding: the panel's own `py-6` handles the gap under the bar, and
             * below `md` the content scrolls under a sticky bar that is already 60 tall. The bottom
             * padding is the page's, not the card's — from `md` the card grows into this column, so
             * the 24px is what keeps it off the viewport's bottom edge.
             */}
            <div className={`${GIFT_CODE_CONTAINER} flex flex-1 flex-col pb-6`}>
                <RedeemGiftCodeView />
            </div>
        </main>
    )
}
