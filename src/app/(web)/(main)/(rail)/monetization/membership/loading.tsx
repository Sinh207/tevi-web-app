import {
    MembershipDashboardSkeleton,
    MONETIZATION_CONTAINER,
} from '@features/monetization/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/monetization/membership`.
 *
 * **Both imports come from `@features/monetization/skeleton`, never the barrel** — see that file:
 * routed through `index.ts` this boundary becomes a client entry chunk the CSP refuses, and the
 * skeleton silently stops painting.
 *
 * No back bar is drawn here. The real screen's bar is *state* (it carries the `⋯` menu and its title
 * switches between the overview and the form), so it lives inside `MembershipDashboard`; reserving a
 * static one here would paint a bar, then replace it with a different bar. The route's own layout
 * keeps the column, which is what stops the content jumping sideways.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${MONETIZATION_CONTAINER} flex flex-1 flex-col pb-6`}>
                <MembershipDashboardSkeleton />
            </div>
        </main>
    )
}
