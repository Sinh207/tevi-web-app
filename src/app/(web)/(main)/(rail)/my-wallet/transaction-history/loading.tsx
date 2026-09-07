import { MY_WALLET_CONTAINER, MY_WALLET_SCREEN } from '@features/my-wallet/skeleton'
import { LedgerSkeleton } from '@shared/components/ledger'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into
 * `/my-wallet/transaction-history` — which is the common case, since the way in is the **View all**
 * link on `/my-wallet`.
 *
 * Built from the same `LedgerSkeleton` the panel uses, for the reason `/my-star/loading.tsx` gives:
 * a skeleton assembled from different parts than the screen it stands in for measures differently,
 * and the list then jumps as it resolves.
 *
 * ## The bar is drawn here, unlike `/my-wallet`'s own `loading.tsx`
 *
 * Because on this route the bar belongs to a **client** component (it carries the filter, whose value
 * is client state), so it is not in the HTML until the view hydrates. Without it this skeleton is 60px
 * shorter than the screen it stands in for and the whole list steps up as the view arrives.
 *
 * It is deliberately **not** `PageBackBar`: that is a client component wanting a router, and a
 * skeleton has nothing to navigate. So it is the DS `AppBar` frame with the real title — this file is
 * a server component, so `getServerT()` gives it the same words the view will print — and a 40px disc
 * where the back button lands. A control that cannot be pressed yet is drawn as its own shape, never
 * as a live button that does nothing.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${MY_WALLET_SCREEN}`}>
            <div className={`sticky top-0 z-20 ${MY_WALLET_SCREEN}`}>
                <AppBar className={`md:px-0 ${MY_WALLET_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1`: the real bar's title is the page's only h1, and a skeleton
                                announcing a second one would put two in the document for the moment
                                both exist. */}
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('balance_txn_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${MY_WALLET_CONTAINER} flex flex-1 flex-col pb-6`}>
                {/*
                 * The panel's two ends, matching `LedgerPanel`'s `fullBleed`: full-bleed below `md`
                 * (the screen is already the surface, and `-mx-4` cancels the column's inset), the
                 * card from `md` up. The skeleton and the screen have to agree about this or the
                 * list shifts sideways as the view arrives.
                 */}
                <div className="-mx-4 overflow-clip bg-(--background-surface) md:mx-0 md:rounded-xl">
                    <LedgerSkeleton data-testid="my-wallet-history-loading" />
                </div>
            </div>
        </main>
    )
}
