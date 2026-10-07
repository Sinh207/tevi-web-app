import { EVENT_CONTAINER, EventSkeleton } from '@features/event/skeleton'
import { BarIconButtonSkeleton } from '@shared/components/bar-icon-button-skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'

/**
 * Shown during the streaming gap while the server fetches the event, and on a client-side
 * navigation into this route from one of the three surfaces that link at it.
 *
 * It draws the **same** `EventSkeleton` the screen's own loading branch does, not a second skeleton
 * that resembles it: two paths lead here, and if each invented its own idea of what the page looks
 * like while it loads, one of them would end in a layout shift. That component's own doc explains
 * which blocks it reserves and which it deliberately does not.
 *
 * ## The bar is drawn here, and it has to be
 *
 * The screen's bar is a **client** component (`EventTopBar` — it needs a router for the back
 * button), so it is not in the HTML until the view hydrates. Without a bar of its own this skeleton
 * is 60px shorter than the page it stands in for and the whole stack steps up as the view arrives.
 *
 * It is deliberately **not** `EventTopBar`: that wants a router, and a skeleton has nothing to
 * navigate. So it is the DS `AppBar` frame with the real title — this file is a server component, so
 * `getServerT()` prints the same words the view will — and a 40px disc where the back button lands.
 * A control that cannot be pressed yet is drawn as its own shape, never as a live button that does
 * nothing.
 *
 * A `<span>` for the title, not an `h1`: the page's `h1` is the **event's** title inside the details
 * card (see `EventTopBar` for why the bar's label is not it), and a skeleton announcing a heading
 * would put one in the document that the real page does not have.
 *
 * ## The page colour on the bar, at every width
 *
 * `docs/DESIGN_SYSTEM.md` §6. This page is the **multi-block** branch — a stack of cards with the
 * page colour between them — so the plane never becomes a surface and the bar is painted the same
 * colour the column is. It carried `EVENT_SCREEN` until that was reviewed; see that constant's own
 * doc for what painting a multi-block screen does to the gaps that separate its cards.
 *
 * ⚠ The feature import is `@features/event/skeleton`, **not** the barrel — see that file.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <AppBar className={`md:px-0 ${EVENT_CONTAINER} max-md:px-0`}>
                    <AppBarCluster className="min-w-0">
                        <BarIconButtonSkeleton />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-112px)]">
                        <AppBarTitleText className="max-w-full truncate">
                            {t('event_live_details')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            {/* No top padding — `AppBar` already carries 8px of clear space below its contents, and
                the page's column carries none either. The two are the same layout. */}
            <div className={`${EVENT_CONTAINER} flex flex-1 flex-col gap-4 pb-6`}>
                <EventSkeleton />
            </div>
        </main>
    )
}
