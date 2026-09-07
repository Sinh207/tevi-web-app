import { CHANNEL_SETTINGS_CONTAINER, FollowRequestsView } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/follow-requests` — the people asking to follow this account's protected space, and the two
 * answers.
 *
 * The URL is legacy's (`pages/follow-requests`), kept so existing links and the mobile apps'
 * deep links still resolve on a same-origin cutover. Top-level rather than under `/settings`,
 * also legacy's shape and the right one: it is a queue of decisions, not a preference — see
 * `FOLLOW_REQUESTS_PATH`. It is reached from the account drawer's CREATORS section, which is the
 * only entry point either app has.
 *
 * A sub-page, so it sits in `(main)` and not in `(tabs)`: it brings its own back bar instead of
 * the global mobile top bar, like `/identification` and `/settings/blocked-accounts`.
 *
 * **`noindex, nofollow`.** A personal screen whose content differs for every visitor, means
 * nothing to a crawler, and — like the blocked list — is a list of other people's names.
 * Deliberately *not* added to `robots.ts`'s disallow list, for the reason spelled out on
 * `/identification`: a disallowed URL is one a crawler never fetches, so it never reads the
 * `noindex` either, and a page linked from the drawer on every screen can still surface as a
 * bare URL. Crawlable + `noindex` is the combination that actually keeps it out.
 *
 * Everything below the bar is client code, and it has to be: the queue is
 * `my-channel/follow-requests/` as *this bearer*, and there is no SSR bearer in this app by
 * construction (`shared/lib/api/token.ts`). The page still renders on the server — shell, bar and
 * title are there on first paint, and the rows resolve after.
 *
 * The content column carries **no side padding and a bottom one only from `md`**, exactly as
 * `/settings/blocked-accounts` does: the panel is full-bleed below `md` (its rows run edge to
 * edge, as the mobile app's do, and it should meet the bottom edge), so a `px-3` here would
 * inset it by 12px at every width with nothing the panel could do about it. From `md` the panel
 * is a rounded surface and `md:pb-6` is what leaves its bottom two corners something to be seen
 * against.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('follow_requests_title'),
        alternates: { canonical: '/follow-requests' },
        robots: { index: false, follow: false },
    }
}

export default async function FollowRequestsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            {/* No hairline under the bar, matching `/identification` and the blocked list: the
                panel below brings its own edge at `md` and up, and a full-bleed rule across a
                screen whose content is already a bounded surface only draws a second one. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('follow_requests_title')}
                    className={CHANNEL_SETTINGS_CONTAINER}
                />
            </div>
            <div className={`${CHANNEL_SETTINGS_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <FollowRequestsView />
            </div>
        </main>
    )
}
