import { EVENT_LIST_CONTAINER, EVENT_SCREEN, EventReportSkeleton } from '@features/event/skeleton'
import { BarIconButtonSkeleton } from '@shared/components/bar-icon-button-skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'

/**
 * Shown during the streaming gap, and on the client-side navigation in from *Revenue summary* —
 * which is the common way in.
 *
 * It draws the **same** `EventReportSkeleton` the screen's own branch does. Two paths lead here and
 * an idea of the layout invented separately for each is one layout shift.
 *
 * The bar is drawn here because the screen's is a **client** component (it needs a router for back),
 * so it is not in the HTML until the view hydrates — without one this skeleton is 60px shorter than
 * the page it stands in for and the whole list steps up as the view arrives. A 40px disc stands in
 * for the back button: a control that cannot be pressed yet is drawn as its own shape, never as a
 * live button that does nothing.
 *
 * ⚠ A `<span>` for the title, **not** an `h1` — unlike the real bar, which does own the page's
 * heading here. Two `h1`s would be in the document for the moment both are mounted.
 *
 * `EVENT_SCREEN` on both the bar and the column: `docs/DESIGN_SYSTEM.md` §6, and the list is a
 * single block, so the surface is full-bleed below `md` and the bar has to be painted the same.
 *
 * ⚠ The feature import is `@features/event/skeleton`, **not** the barrel — see that file.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className={`flex flex-1 flex-col ${EVENT_SCREEN}`}>
            <div className={`sticky top-0 z-20 ${EVENT_SCREEN}`}>
                <AppBar className={`md:px-0 ${EVENT_LIST_CONTAINER} max-md:px-0`}>
                    <AppBarCluster className="min-w-0">
                        <BarIconButtonSkeleton />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-112px)]">
                        <AppBarTitleText className="max-w-full truncate">
                            {t('event_report_details')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${EVENT_LIST_CONTAINER} flex flex-1 flex-col pb-6`}>
                <EventReportSkeleton />
            </div>
        </main>
    )
}
