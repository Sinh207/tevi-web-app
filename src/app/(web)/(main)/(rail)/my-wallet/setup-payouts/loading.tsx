/*
 * `@features/payout/skeleton`, **not** the barrel — the barrel would put the whole feature in this
 * loading chunk, which the app's CSP then refuses. See that file.
 */
import { PAYOUT_CARD_CONTAINER } from '@features/payout/skeleton'
import { BarIconButtonSkeleton } from '@shared/components/bar-icon-button-skeleton'
import { getServerT } from '@shared/i18n/server'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * Shown during the streaming gap and on a client-side navigation into `/my-wallet/setup-payouts`.
 *
 * The two blocks the screen is made of — the country field and the method list — at the heights they
 * will have, so nothing steps as the queries land. No shared skeleton component for it: unlike the two
 * list screens, this shape is not a row repeated, so there is nothing for the real screen and this file
 * to share except the container classes.
 */
export default async function Loading() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col">
            <div className="sticky top-0 z-20 bg-(--background)">
                <AppBar className={`md:px-0 ${PAYOUT_CARD_CONTAINER} max-md:px-0`}>
                    <AppBarCluster className="min-w-0">
                        <BarIconButtonSkeleton />
                    </AppBarCluster>
                    <AppBarTitle className="max-w-[calc(100%-160px)]">
                        <AppBarTitleText as="span" className="max-w-full truncate">
                            {t('payout_setup_title')}
                        </AppBarTitleText>
                    </AppBarTitle>
                </AppBar>
            </div>
            <div className={`${PAYOUT_CARD_CONTAINER} flex flex-1 flex-col gap-3 pb-6`}>
                <div className="flex flex-col gap-2 pt-2">
                    <Skeleton w="60%" h={18} />
                    <Skeleton w="85%" h={14} delay={80} />
                </div>
                <div className="flex flex-col gap-3 rounded-2xl bg-(--background-surface) p-4">
                    <Skeleton w="45%" h={16} delay={120} />
                    <Skeleton w="100%" h={48} delay={160} />
                </div>
                <div className="flex flex-col gap-3 rounded-2xl bg-(--background-surface) p-4">
                    <Skeleton w="55%" h={16} delay={200} />
                    {[0, 1, 2].map(index => (
                        <div key={index} className="flex items-center gap-3">
                            <Skeleton w={28} h={28} delay={240 + index * 80} />
                            <Skeleton w="60%" h={16} delay={280 + index * 80} />
                        </div>
                    ))}
                </div>
            </div>
        </main>
    )
}
