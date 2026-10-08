import {
    EVENT_CONTAINER,
    EVENT_PANEL,
    EVENT_SCREEN,
    EventNotFoundState,
    EventTopBar,
} from '@features/event'

/**
 * No such event — **the event's own wall, inside the event's own page.**
 *
 * ## Why this file exists at all
 *
 * `notFound()` renders the nearest `not-found.tsx` **up the segment tree**, and the nearest one above
 * this is `[slug]/not-found.tsx` — the *channel's*. So until this file existed, a reader who followed
 * a dead event link was told **"Uh-oh! This Space isn't available"**, with the space illustration and
 * a *Discover Creators* button, for a space that exists perfectly well and whose page is one level
 * up. Nothing failed loudly: `notFound()` did what it always does, a 404-shaped screen appeared, and
 * the copy was about the wrong noun.
 *
 * It also covers `report/` below it — a report for an event that does not exist is a missing
 * **event**.
 *
 * ## It composes the page, rather than replacing it
 *
 * `app/not-found.tsx` is the full-bleed frame, and it is right there: a URL matching **no route** has
 * no page to keep. A route that exists does. So this draws the same bar and the same column the event
 * page draws and puts the wall where the content would be — the reader keeps the back button and can
 * see which space the link named.
 *
 * ## The client path renders the identical block
 *
 * `EventScreen` and `EventReportScreen` draw `EventNotFoundState` in their own column when the
 * *browser's* fetch is the one that gets the 404. Pointing this boundary at the same component is
 * what stops the two from drifting — which is exactly the drift that produced the channel-wall bug
 * above.
 *
 * `EventTopBar` takes no slug here: `not-found.tsx` receives no route params, so Back falls through
 * to its `/` home rather than to a space it cannot name. That is the one thing this screen has less
 * of than the client's, and it is a Next constraint rather than a choice.
 *
 * ⚠ Like every `notFound()` in this app it is a **soft 404** — 200 with the not-found body, plus the
 * `noindex` Next adds. Not this file's doing: a `loading.tsx` above has streamed before `notFound()`
 * runs, so the status line is already sent. `(main)/[slug]/page.tsx` carries the measurement and
 * why it is left alone.
 */
export default function EventNotFound() {
    return (
        /*
         * A wall is the only thing this route ever shows, so it is `docs/DESIGN_SYSTEM.md` §6's
         * **single-panel** branch unconditionally: the surface runs full-bleed below `md` and becomes
         * a card above it, on the plane *and* on the bar. `EventScreen` switches the same pair on by
         * state; here there is no other state to switch from.
         */
        <main className={`flex flex-1 flex-col ${EVENT_SCREEN}`}>
            <div className={`sticky top-0 z-20 ${EVENT_SCREEN}`}>
                <EventTopBar slug={null} />
            </div>
            <div className={`${EVENT_CONTAINER} flex flex-1 flex-col pb-6`}>
                <div className={`flex flex-1 flex-col ${EVENT_PANEL}`}>
                    <EventNotFoundState />
                </div>
            </div>
        </main>
    )
}
