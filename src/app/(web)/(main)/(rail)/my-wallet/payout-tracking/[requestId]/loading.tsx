/*
 * `@features/payout/skeleton`, **not** the barrel — see that file: the barrel puts the whole
 * feature in this loading chunk and the app's CSP blocks it, silently.
 */
import { PAYOUT_CONTAINER, PayoutDetailSkeleton } from '@features/payout/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation from the tracking list — which is how
 * a reader normally arrives.
 *
 * Built from `PayoutDetailSkeleton`, the view's **own** skeleton, so the screen does not change shape as
 * it resolves. The bar is drawn here because on this route it belongs to a client component and is not
 * in the HTML until the view hydrates; deliberately not `PageBackBar`, which wants a router a skeleton
 * has no use for.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        // `--background`: three cards separated by the page colour, not one full-bleed panel.
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <AppBar className={`md:px-0 ${PAYOUT_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1` — the real bar's title is the page's only one. */}
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('payout_detail_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${PAYOUT_CONTAINER} flex flex-1 flex-col pb-6`}>
                <div className="flex flex-col overflow-clip bg-(--background-surface) px-4 md:rounded-xl">
                    <PayoutDetailSkeleton />
                </div>
            </div>
        </main>
    )
}
