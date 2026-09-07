import { MCN_PARTNERSHIP_CONTAINER, McnPartnershipSkeleton } from '@features/channel/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/mcn-partnership` — which is
 * the common case, since the only way in is the account drawer's row.
 *
 * It is the **same component** the screen's own loading state renders, not a second skeleton that
 * resembles it: two paths lead here — the drawer row and a direct visit — and if each invented its
 * own idea of what the screen looks like while it loads, one of them would end in a layout shift.
 *
 * ## The bar is drawn here, and it has to be
 *
 * The screen's bar belongs to a **client** component (its trailing kebab is state — see
 * `McnPartnershipView`), so it is not in the HTML until the view hydrates. Without a bar of its own
 * this skeleton is 60px shorter than the screen it stands in for, and the whole stack of cards steps
 * up as the view arrives. `/my-wallet/transaction-history/loading.tsx` is in exactly this position
 * and draws exactly this.
 *
 * It is deliberately **not** `PageBackBar`: that is a client component wanting a router, and a
 * skeleton has nothing to navigate. So it is the DS `AppBar` frame with the real title — this file
 * is a server component, so `getServerT()` prints the same words the view will — and a 40px disc
 * where the back button lands. A control that cannot be pressed yet is drawn as its own shape, never
 * as a live button that does nothing.
 *
 * ## Page colour, not the screen's surface
 *
 * `MCN_PARTNERSHIP_SCREEN` is deliberately absent: it belongs to this screen's **empty** states, and
 * what is drawn here is the *cards*. Painting the skeleton like the empty state would mean the plane
 * changes colour under a skeleton that was already right — `docs/DESIGN_SYSTEM.md` §6.
 *
 * ⚠ The feature import is `@features/channel/skeleton`, **not** the barrel — see that file.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <AppBar className={`md:px-0 ${MCN_PARTNERSHIP_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1`: the real bar's title is the page's only h1, and a
                            skeleton announcing a second one would put two in the document for the
                            moment both are mounted. */}
                        <AppBarTitleText className="max-w-full truncate">
                            {t('mcn_partnership_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${MCN_PARTNERSHIP_CONTAINER} flex flex-1 flex-col pb-6`}>
                <McnPartnershipSkeleton />
            </div>
        </main>
    )
}
