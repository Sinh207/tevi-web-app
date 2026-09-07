import {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
    McnUserInvitationSkeleton,
} from '@features/channel/skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap on `/mcn-user-invitation/verify` — which here is the **only** way
 * in, since the route is reached from an email rather than from anywhere inside the app. There is no
 * client-side navigation to this screen at all, so this file is what the reader sees first, every
 * time.
 *
 * It is the **same component** the screen's own loading state renders, not a second skeleton that
 * resembles it: two paths lead to a skeleton on this route (this one and the in-screen wait while
 * the invitation is fetched), and if either invented its own idea of the layout the other would end
 * in a shift. `McnUserInvitationSkeleton` carries the geometry.
 *
 * ## The bar is drawn here, and it has to be
 *
 * The screen's bar belongs to a **client** component, so it is not in the HTML until the view
 * hydrates. Without a bar of its own this skeleton is 60px shorter than the screen it stands in for
 * and the whole letter steps up as the view arrives.
 *
 * It is deliberately **not** `PageBackBar`: that is a client component wanting a router, and a
 * skeleton has nothing to navigate. So it is the DS `AppBar` frame with the real title — this file is
 * a server component, so `getServerT()` prints the same words the view will — and a 40px disc where
 * the back button lands. A control that cannot be pressed yet is drawn as its own shape, never as a
 * live button that does nothing.
 *
 * ## The surface **is** applied here
 *
 * Every state of this screen is one panel, and the skeleton is inside it — so `MCN_INVITATION_SCREEN`
 * and `MCN_INVITATION_PANEL` go on exactly the boxes the view puts them on, which is what makes
 * hydration invisible instead of a colour change (`docs/DESIGN_SYSTEM.md` §6). The three constants
 * are the creator invitation's and shared on purpose: the two screens are the same panel, and
 * `mcn-user-invitation-view.tsx` says why that sharing stops at the geometry.
 *
 * ⚠ The feature import is `@features/channel/skeleton`, **not** the barrel — see that file.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className={`sticky top-0 z-20 ${MCN_INVITATION_SCREEN}`}>
                <AppBar className={`md:px-0 ${MCN_INVITATION_CONTAINER}`}>
                    <AppBarCluster className="min-w-0">
                        <Skeleton w={40} h={40} circle />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        {/* `span`, not `h1`: the real bar's title is the page's only h1, and a
                            skeleton announcing a second one would put two in the document for the
                            moment both are mounted. */}
                        <AppBarTitleText className="max-w-full truncate">
                            {t('mcn_invitation_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div
                className={`${MCN_INVITATION_CONTAINER} ${MCN_INVITATION_SCREEN} flex flex-1 flex-col`}
            >
                <div className={`flex flex-1 flex-col ${MCN_INVITATION_PANEL}`} aria-busy>
                    <McnUserInvitationSkeleton />
                </div>
            </div>
        </main>
    )
}
