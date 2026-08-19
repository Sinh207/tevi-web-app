import { toChannelPath } from '@features/channel'
import { EARNINGS_CONTAINER, EarningsReportView } from '@features/earnings'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * The composition both earnings-report routes render, and the metadata both of them return.
 *
 * A colocated module rather than two copies, because the pair differ in exactly one value — the
 * `[dateTs]` segment — and everything else about them (the bar, the column, the `noindex`, the
 * canonical) has to stay identical or the deep-linked variant slowly becomes a second screen.
 * Only `page.tsx`/`layout.tsx`/`loading.tsx` are routes in the App Router, so a `screen.tsx`
 * beside them is a plain module; `app/dev/splash/preview.tsx` is the same shape.
 *
 * `app/` still holds no business logic: this is composition — a bar, a column, and the feature's
 * view — which is exactly what `app/` is for.
 */

/**
 * `noindex, nofollow`, and **not** added to `robots.ts`'s disallow list.
 *
 * A creator's own payout report: its content differs for every visitor, means nothing to a
 * crawler, and is money. Legacy sets the same pair.
 *
 * Disallowing it in `robots.ts` would be the reflex and it is the wrong move, for the reason
 * `/identification` and `/settings/blocked-accounts` both write down: a disallowed URL is one a
 * crawler never *fetches*, so it never reads the `noindex` either, and a URL that is linked from
 * a button on every creator's own space can still surface as a bare address. Crawlable +
 * `noindex` is the combination that actually keeps it out of the index.
 *
 * The canonical carries the day segment when there is one — without it, every day's report claims
 * the same canonical as the parent route, which is the note legacy's `[dateTs]` page also makes.
 *
 * The title is deliberately **static** apart from the handle. The page is `noindex`, so resolving
 * the channel would buy nothing: no crawler indexes the title, no rich result is emitted, and the
 * lookup would cost an upstream call on every render. Legacy says the same in its own words.
 */
export async function earningsMetadata(slug: string, dateSegment?: string): Promise<Metadata> {
    const t = await getServerT()
    const path = `${toChannelPath(slug)}/earnings-report`
    return {
        title: `${t('earnings_title')} — @${slug}`,
        alternates: {
            canonical: dateSegment ? `${path}/${encodeURIComponent(dateSegment)}` : path,
        },
        robots: { index: false, follow: false },
    }
}

/**
 * The screen: sticky back bar, then the report.
 *
 * ## `home` is the creator's space, not `/`
 *
 * `PageBackBar` falls back to `home` only when there is nothing to go back to — a shared link, a
 * push notification, a deep link out of the mobile app, which is precisely how the `[dateTs]`
 * route is usually reached. The place that URL "came from" is the space it names, and that is
 * also where legacy's back button goes (`router.push('/' + channelSlug)`).
 *
 * ## The bar gets the column's own class
 *
 * So the back button lines up with the day cards — 16px in below `md`, flush with the column's
 * edge from `md` — instead of floating at the window edge above a centred stack. The sticky
 * background stays full-bleed because it lives on the wrapper, not on the bar.
 *
 * No hairline under the bar: the cards below bring their own edges, and a full-bleed rule across a
 * screen whose content is already a set of bounded surfaces only draws a second one. Same call as
 * `/settings/blocked-accounts`.
 */
export async function EarningsReportScreen({
    slug,
    initialDateSeconds = null,
}: {
    slug: string
    initialDateSeconds?: number | null
}) {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('earnings_title')}
                    home={toChannelPath(slug)}
                    className={EARNINGS_CONTAINER}
                />
            </div>
            <div className={`${EARNINGS_CONTAINER} flex flex-1 flex-col pb-6`}>
                <EarningsReportView slug={slug} initialDateSeconds={initialDateSeconds} />
            </div>
        </main>
    )
}
