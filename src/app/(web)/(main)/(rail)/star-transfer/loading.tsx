import { STAR_TRANSFER_CONTAINER, StarTransferSkeleton } from '@features/star-transfer/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/star-transfer`.
 *
 * It is the **same component** the screen's own loading state uses (`StarTransferSkeleton`), not a second
 * skeleton that resembles it: two paths lead here — a drawer row and a direct visit — and they must not
 * each invent their own idea of what the screen looks like while it loads, or one of them ends in a layout
 * shift.
 *
 * The bar is **not** drawn here, and on this route that is not a choice: the bar's title switches with the
 * screen's own state, so it lives inside the view (see `StarTransferView`) and there is nothing for a
 * server-rendered fallback to draw.
 *
 * No hooks anywhere, which is what lets this render on the server.
 *
 * ⚠ The import is `@features/star-transfer/skeleton`, **not** the feature barrel. Through the barrel
 * this boundary becomes its own client entry chunk and the app's strict CSP refuses to load it — the
 * skeleton then never paints, with nothing but a console line to say so. The door module carries the
 * post-mortem; `features/analytics/skeleton.ts` documents the same trap.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            {/* The same box the view uses for its own loading state — flush below `md`, air from `md`. */}
            <div className={`${STAR_TRANSFER_CONTAINER} flex flex-1 flex-col md:pb-6`}>
                <StarTransferSkeleton />
            </div>
        </main>
    )
}
