import { MONETIZATION_CONTAINER, MonetizationView } from '@features/monetization'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/monetization` — the creator's hub: estimated revenue, withdrawable balance, and the four ways to
 * earn.
 *
 * A sub-page, so `(main)` and not `(tabs)`: its own back bar rather than the global mobile top bar.
 *
 * ## Client-only below the bar, `noindex`
 *
 * Both for the reasons `/my-wallet` gives: every figure here is derived from a bearer that does not
 * exist server-side, and one creator's earnings mean nothing to a crawler. Legacy sets
 * `robots: 'noindex, nofollow'` on this page too.
 *
 * It is deliberately **not** added to `robots.ts`: a disallowed URL is never fetched, so the crawler
 * never reads the `noindex` that would actually keep it out of the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('monetization_title'),
        alternates: { canonical: '/monetization' },
        robots: { index: false, follow: false },
    }
}

export default async function MonetizationPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar title={t('monetization_title')} className={MONETIZATION_CONTAINER} />
            </div>
            <div className={`${MONETIZATION_CONTAINER} flex flex-1 flex-col pb-6`}>
                <MonetizationView />
            </div>
        </main>
    )
}
