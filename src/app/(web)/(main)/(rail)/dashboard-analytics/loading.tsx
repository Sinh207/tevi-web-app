import { ANALYTICS_CONTAINER, AnalyticsSkeleton } from '@features/analytics/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into the dashboard.
 *
 * `AnalyticsSkeleton` has no hooks, so it renders on the server — the same component the view's own
 * loading state uses, which is the point: three paths into this screen should not each invent their
 * own idea of what it looks like while loading.
 *
 * ⚠ Imported from `@features/analytics/skeleton`, **not** the feature barrel. The barrel drags the
 * whole client graph into this boundary and the resulting chunk is refused by the app's CSP in dev, so
 * the skeleton never paints. That file explains it at length; the short version is that a
 * `loading.tsx` should depend on as little as it renders.
 *
 * The bar is **not** drawn here. It is server-rendered by the page itself, so during the gap the real
 * one is already on screen; a second one in the skeleton would flash and be replaced.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${ANALYTICS_CONTAINER} flex flex-1 flex-col pb-6`}>
                <AnalyticsSkeleton />
            </div>
        </main>
    )
}
