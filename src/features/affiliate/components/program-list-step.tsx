'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Skeleton } from '@shared/ui/skeleton'
import type { Program } from '../api/types'
import type { AffiliateData } from '../hooks/use-affiliate-data'
import { ProgramRow } from './program-row'
import { PromotingCard } from './promoting-card'

/** Matches `ProgramRow`'s geometry so the list does not resize when the rows land. */
function ProgramRowsSkeleton({ count = 3 }: { count?: number }) {
    return (
        <ul aria-busy="true" className="divide-y divide-(--separator-default)">
            {Array.from({ length: count }, (_, index) => index).map(i => (
                <li key={`program-skeleton-${i}`} className="flex items-center gap-2 px-4 py-2">
                    <Skeleton circle w={48} h={48} delay={i * 160} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                        <span className="flex h-[24px] items-center">
                            <Skeleton className="w-[60%]" delay={i * 160} />
                        </span>
                        <span className="flex h-[20px] items-center">
                            <Skeleton className="w-[120px]" delay={i * 160} />
                        </span>
                    </div>
                    <Skeleton w={64} h={28} delay={i * 160} />
                </li>
            ))}
        </ul>
    )
}

/**
 * The dialog's first screen: the pitch, the card for whatever is being promoted, and everything
 * else on offer.
 *
 * ## The promoted program is not in the list
 *
 * It has its own card above, so leaving it in the list would offer "Switch" to the program already
 * running. Legacy filters the same way. The filter is on **id**, which is why `types.ts` normalises
 * ids to strings — legacy compares a raw wire value and `1 !== '1'` puts the promoted row back.
 *
 * ## Empty and loading are different screens
 *
 * A creator with no programs on offer gets a sentence, not an empty box; a creator waiting gets rows
 * at their real height. The two are told apart by `isLoadingPrograms`, never by an empty array.
 */
export function ProgramListStep({
    data,
    isBusy,
    onPick,
    onOpenPromoted,
}: {
    data: AffiliateData
    /** A write is in flight — every row's action goes quiet rather than queueing a second join. */
    isBusy: boolean
    onPick: (program: Program) => void
    onOpenPromoted: () => void
}) {
    const { t } = useTranslation()
    const {
        programs,
        currentCampaign,
        stats,
        isLoadingPrograms,
        isLoadingCurrent,
        isLoadingStats,
        promotingId,
    } = data

    const rows = programs.filter(program => program.id !== promotingId)
    const actionLabel = promotingId ? t('affiliate_switch') : t('affiliate_join')

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="type-title-t1-bold text-(--text-title)">
                    {t('affiliate_list_title')}
                </h2>
                <p className="type-dense-default text-(--text-body)">{t('affiliate_list_body')}</p>
            </div>

            {/* Held back until the campaign is known: rendering the list first and slotting this in
                afterwards moves every row down the moment it arrives. */}
            {isLoadingCurrent ? (
                <div className="h-[132px] rounded-xl bg-(--background-surface)" aria-busy="true" />
            ) : currentCampaign ? (
                <PromotingCard
                    campaign={currentCampaign}
                    stats={stats}
                    isLoadingStats={isLoadingStats}
                    onPress={onOpenPromoted}
                    disabled={isBusy}
                />
            ) : null}

            <section className="overflow-hidden rounded-xl bg-(--background-surface)">
                <h3 className="type-body-strong border-b border-b-(--separator-default) px-4 py-3 text-(--text-subtitle)">
                    {t('affiliate_programs_heading')}
                </h3>

                {isLoadingPrograms ? (
                    <ProgramRowsSkeleton />
                ) : rows.length === 0 ? (
                    <p className="type-dense-default px-4 py-6 text-center text-(--text-subtitle)">
                        {t('affiliate_empty')}
                    </p>
                ) : (
                    <ul className="divide-y divide-(--separator-default)">
                        {rows.map(program => (
                            <ProgramRow
                                key={program.id}
                                program={program}
                                actionLabel={actionLabel}
                                onPress={onPick}
                                disabled={isBusy}
                            />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
