import { SPACE_TIER_CONTAINER, SpaceTierSkeleton } from '@features/space-tier/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/space-tier`. Both imports
 * come from the `skeleton` barrel, never the main one — see that file. No bar here: the view owns
 * it, and a static one would paint a bar and then replace it.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${SPACE_TIER_CONTAINER} flex flex-1 flex-col`}>
                <SpaceTierSkeleton />
            </div>
        </main>
    )
}
