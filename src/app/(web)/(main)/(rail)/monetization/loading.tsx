import { MONETIZATION_CONTAINER, RevenueCardSkeleton } from '@features/monetization/skeleton'
import { ActionRowsSkeleton } from '@shared/components/action-rows'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/monetization`.
 *
 * The same three blocks `MonetizationView` renders, in the same order and at the same heights — the
 * revenue card, the section heading, and four method rows. That is what stops the screen moving as it
 * resolves; `/my-star/loading.tsx` carries the full argument for why a route's skeleton and its
 * screen's own loading branch have to be built from the same parts.
 *
 * **Both imports come from `@features/monetization/skeleton`, never the barrel** — see that file:
 * routed through `index.ts` this boundary becomes a client entry chunk the CSP refuses, and the
 * skeleton silently stops painting.
 *
 * The **banner is not reserved**, and that is deliberate rather than an omission: it is shown only to
 * a creator who has not earned anything (`hasData` in `MonetizationView`), so the state that decides
 * it is exactly the request this skeleton is waiting on. Drawing it would be guessing at a state, and
 * the wrong guess is the more common one — the banner disappearing under the reader's eyes.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${MONETIZATION_CONTAINER} flex flex-1 flex-col gap-3 pb-6`}>
                <RevenueCardSkeleton />
                <div className="flex flex-col gap-1">
                    <div className="flex h-8 items-center">
                        <Skeleton w={180} h={14} />
                    </div>
                    <ActionRowsSkeleton data-testid="monetization-loading" count={4} />
                </div>
            </div>
        </main>
    )
}
