import { MY_STAR_CONTAINER } from '@features/my-star/skeleton'
import { ActionRowsSkeleton } from '@shared/components/action-rows'
import { LedgerSkeleton } from '@shared/components/ledger'
import { Card, CardItem, CardMeta } from '@shared/ui/card'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/my-star`.
 *
 * Composed from the **same** parts `MyStarView` uses for its own loading state — two paths lead here (a
 * drawer row and a direct visit) and they must not each invent their own idea of what the screen looks like
 * while it loads, or one of them ends in a layout shift.
 *
 * The hero card keeps its **black gradient**: it is pinned dark in both themes (see `BALANCE_TOKENS`), so a
 * grey placeholder rectangle would be a different-coloured slab that then flips to black — two visual
 * changes where there should be one. The 36px circle reserves the Star mark, which is the one difference
 * between this skeleton and `/my-wallet`'s.
 *
 * The bar is **not** drawn here. The page server-renders it, so during the gap the real one is already on
 * screen; a second one in the skeleton would flash and be replaced.
 *
 * No hooks anywhere, which is what lets this render on the server.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${MY_STAR_CONTAINER} flex flex-1 flex-col gap-3 pb-6`}>
                <Card type="balance" aria-busy="true">
                    <CardItem type="large-item">
                        <Skeleton w={96} h={14} />
                    </CardItem>
                    <CardMeta gap="4" justify="start">
                        <Skeleton w={36} h={36} circle delay={80} />
                        <Skeleton w={168} h={32} delay={160} />
                    </CardMeta>
                </Card>
                <ActionRowsSkeleton count={2} />
                <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                    <LedgerSkeleton data-testid="my-star-loading" />
                </div>
            </div>
        </main>
    )
}
