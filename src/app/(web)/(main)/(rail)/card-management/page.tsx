import { PageBackBar } from '@features/navigation'
import { CARD_MANAGEMENT_CONTAINER, CardManagementView } from '@features/payment'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/card-management` — the cards this account has saved.
 *
 * ## A new address, not a moved one
 *
 * Legacy's card screen is a **tab inside** `/my-wallet` (`containers/wallet/cardManagement`), reached
 * by a segmented control rather than by a URL. So there is nothing in `proxy.ts` to redirect: no
 * address moved, one was added. It is reached from the account drawer's ASSETS section — the
 * `menu_card_management` row, which shipped with no `href` waiting for this page.
 *
 * A sub-page, so it sits in `(main)` and **not** in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar, like `/my-star` and `/my-membership`. It joins `(rail)` because its
 * column caps at 612 — the one thing that group's layout requires.
 *
 * ## No `loading.tsx`, deliberately
 *
 * A `loading.tsx` that imports a feature barrel in this app yields a CSP-blocked chunk, and the
 * failure is silent: the skeleton simply never paints. So the skeleton is driven from the hook's
 * `isLoading` **inside** `CardManagementView`, which is also the only place that can tell "loading"
 * apart from "the session has not resolved yet" and from "there is no account".
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The list is `paymee/payment/v3/my-payment-methods/` **as this bearer**, and there is no SSR bearer
 * in this app by construction (`shared/lib/api/token.ts`). So the server renders the shell, the bar
 * and the title, and the rows resolve after hydration. This is not a case `createServerApiModel`
 * could improve: that client is for public content, and a list of somebody's payment instruments is
 * the opposite of public.
 *
 * ## `noindex, nofollow`, and deliberately **not** in `robots.ts`
 *
 * A personal screen about money. Disallowing it in `robots.ts` would be the reflex and it is the
 * wrong move, for the reason `/my-star`, `/my-membership` and `/identification` all write down: a
 * disallowed URL is one a crawler never *fetches*, so it never reads the `noindex` either — and a URL
 * linked from a row in the account drawer on every screen can still surface as a bare address.
 * Crawlable + `noindex` is the combination that actually keeps it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('payment_card_management_title'),
        alternates: { canonical: '/card-management' },
        robots: { index: false, follow: false },
    }
}

export default async function CardManagementPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/*
             * Opaque and sticky, as on `/my-star` and `/my-membership`: the content scrolls under the
             * bar, so a transparent one would show rows through the title. No hairline — the panel
             * below brings its own edge from `md`, and a full-bleed rule across a screen whose content
             * is already a bounded surface only draws a second one.
             */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('payment_card_management_title')}
                    className={CARD_MANAGEMENT_CONTAINER}
                />
            </div>
            <CardManagementView />
        </main>
    )
}
