import { MY_WALLET_CONTAINER } from '@features/my-wallet/skeleton'
import { ActionRowsSkeleton } from '@shared/components/action-rows'
import { LedgerSkeleton } from '@shared/components/ledger'
import { Card, CardItem, CardMeta } from '@shared/ui/card'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/my-wallet`.
 *
 * The same parts `MyWalletView` uses for its own loading state — see `/my-star/loading.tsx` for why that
 * matters, and for why the hero card keeps its black gradient rather than becoming a grey block.
 *
 * No Star mark reserved here, and three action rows rather than two, so the skeleton is the same height as
 * the screen it stands in for.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${MY_WALLET_CONTAINER} flex flex-1 flex-col gap-3 pb-6`}>
                <Card type="balance" aria-busy="true">
                    <CardItem type="large-item">
                        <Skeleton w={96} h={14} />
                    </CardItem>
                    <CardMeta gap="4" justify="start">
                        <Skeleton w={168} h={32} delay={160} />
                    </CardMeta>
                </Card>
                <ActionRowsSkeleton count={3} />
                <div className="overflow-hidden rounded-xl bg-(--background-surface)">
                    <LedgerSkeleton data-testid="my-wallet-loading" />
                </div>
            </div>
        </main>
    )
}
