/*
 * `@features/payout/skeleton`, **not** the barrel — see that file: the barrel puts the whole
 * feature in this loading chunk and the app's CSP blocks it, silently.
 */
import { PAYOUT_CONTAINER, PAYOUT_SCREEN, PayoutRequestSkeleton } from '@features/payout/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/my-wallet/payout-tracking`,
 * which is how a reader normally arrives — the wallet's third action row.
 *
 * Built from `PayoutRequestSkeleton`, the row's **own** parts: a skeleton assembled from different
 * parts than the rows it stands in for measures differently, and the list then jumps as it resolves.
 *
 * The bar is drawn here because on this route it belongs to a client component, so it is not in the
 * HTML until the view hydrates — without it this skeleton is 60px shorter than the screen and the whole
 * list steps up on arrival. Deliberately **not** `PageBackBar`: that wants a router, and a skeleton has
 * nothing to navigate. A 40px disc marks where the back button lands rather than a live button that
 * does nothing.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${PAYOUT_SCREEN}`}>
            <div className={`sticky top-0 z-20 ${PAYOUT_SCREEN}`}>
                <AppBar className={`md:px-0 ${PAYOUT_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1` — the real bar's title is the page's only one, and two in
                            the document for the moment both exist is one too many. */}
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('payout_tracking_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${PAYOUT_CONTAINER} flex flex-1 flex-col pb-6`}>
                {/* The panel's own rule: nothing below `md`, a card from `md` up — see
                    `PAYOUT_PANEL`. The skeleton has to agree with it or the list moves sideways as it
                    resolves. */}
                <div className="flex flex-col overflow-clip md:rounded-xl md:bg-(--background-surface)">
                    <PayoutRequestSkeleton />
                </div>
            </div>
        </main>
    )
}
