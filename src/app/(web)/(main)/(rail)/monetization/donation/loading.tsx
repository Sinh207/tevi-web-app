import { DonationDashboardSkeleton, MONETIZATION_CONTAINER } from '@features/monetization/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/monetization/donation`.
 *
 * **Both imports come from `@features/monetization/skeleton`, never the barrel** — see that file:
 * routed through `index.ts` this boundary becomes a client entry chunk the CSP refuses, and the
 * skeleton silently stops painting. `features/star-transfer/skeleton.ts` carries the post-mortem.
 *
 * No back bar is drawn here. The real screen's bar is *state* — it carries the `⋯` menu and its
 * title switches between the overview and the setting form — so it lives inside `DonationDashboard`;
 * reserving a static one here would paint a bar, then replace it with a different bar. The route's
 * own layout keeps the column, which is what stops the content jumping sideways.
 *
 * The page colour is kept, deliberately: this screen is not painted as a surface below `md` (see
 * `DONATION_CARD`), so painting the skeleton would make the plane change colour underneath a correct
 * skeleton the moment the data landed. `/monetization/membership/loading.tsx` is the opposite case,
 * one route away.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${MONETIZATION_CONTAINER} flex flex-1 flex-col pb-6`}>
                <DonationDashboardSkeleton />
            </div>
        </main>
    )
}
