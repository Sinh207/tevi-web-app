/*
 * `@features/payout/skeleton`, **not** the barrel — see that file: the barrel puts the whole feature
 * in this loading chunk and the app's CSP blocks it, silently.
 */
import { PAYOUT_CARD_CONTAINER, PayoutMethodSkeleton } from '@features/payout/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/my-wallet/payout-method` —
 * which is how a reader normally arrives, from the wallet's second action row.
 *
 * Built from the card's **own** geometry (`PayoutMethodSkeleton` shares `PAYOUT_CARD` with the real
 * item), so the list does not jump as it resolves. Page colour and no panel, because that is what the
 * screen is: a stack of cards, not one filled surface.
 *
 * The bar is drawn here because on this route it belongs to a client component and is not in the HTML
 * until the view hydrates; without it this skeleton is 60px shorter than the screen. Deliberately not
 * `PageBackBar` — that wants a router, and a skeleton has nothing to navigate.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <AppBar className={`md:px-0 ${PAYOUT_CARD_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1` — the real bar's title is the page's only one. */}
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('payout_method_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${PAYOUT_CARD_CONTAINER} flex flex-1 flex-col gap-3 pb-6`}>
                <PayoutMethodSkeleton />
                {/* The action's own space directly under the cards, where the real one sits — so the
                    screen does not grow by 48px the moment it resolves. */}
                <div className="pt-3 pb-2">
                    <Skeleton w="100%" h={48} delay={320} />
                </div>
            </div>
        </main>
    )
}
