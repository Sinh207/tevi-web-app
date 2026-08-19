'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import type { CampaignStats, CurrentCampaign } from '../api/types'
import { formatAffiliateMoney } from '../lib/format'
import { ProgramAvatar } from './program-avatar'

/** The app's "not known" figure, same as the account drawer's and the Star pill's. */
const UNKNOWN = '—'

/**
 * The "Promoting" card at the top of the list — the program this account is running, and what it has
 * earned. Pressing it opens the joined screen.
 *
 * ## The whole card is the control here, and that is the difference from `ProgramRow`
 *
 * There is one action ("see the details of the thing I am promoting") and no competing button, so
 * the card is a single `<button>`: one tab stop, one accessible name. Legacy puts a ⋯ menu inside
 * the row and has to `stopPropagation` to keep it from also opening the screen — the menu lives on
 * the joined screen instead, which is where its four items belong.
 *
 * ## Earnings: a skeleton while loading, an em dash if it failed, never a zero
 *
 * `stats` is a separate request from the campaign, so it lands later. Legacy renders
 * `formatMoney(0)` in the gap, which tells a creator who has earned money that they have earned
 * none — the same lie the Star pill used to tell.
 *
 * The third state matters as much as the first two: a stats request that *fails* leaves the figure
 * unknown permanently, so a skeleton there would breathe for the rest of the session. `—` is what
 * this app says for "not known" (`useBalanceDisplay`), and it is a final answer.
 */
export function PromotingCard({
    campaign,
    stats,
    isLoadingStats,
    onPress,
    disabled,
}: {
    campaign: CurrentCampaign
    stats: CampaignStats | null
    isLoadingStats: boolean
    onPress: () => void
    /** A write is in flight, so the screen is about to change under the press. */
    disabled: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const earnings = formatAffiliateMoney(stats?.total_earnings ?? null, currentLanguage)

    return (
        <section className="overflow-hidden rounded-xl bg-(--background-surface)">
            <header className="flex flex-col gap-[2px] border-b border-b-(--separator-default) px-4 py-3">
                <h3 className="type-body-strong text-(--text-subtitle)">
                    {t('affiliate_promoting')}
                </h3>
                <p className="type-dense-default text-(--text-subtitle)">
                    {t('affiliate_promoting_body')}
                </p>
            </header>

            <button
                type="button"
                onClick={onPress}
                disabled={disabled}
                className="flex w-full items-center gap-2 px-4 py-2 text-start transition-colors hover:bg-(--background-subtle) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                <ProgramAvatar program={campaign.program} size="large" px={48} />

                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <p className="type-body-strong w-full truncate text-(--text-title)">
                        {campaign.program?.name}
                    </p>
                    <span className="flex items-center gap-1">
                        <Icon
                            name="badge-dollar"
                            size={16}
                            className="flex-none text-(--icon-secondary)"
                        />
                        <span className="type-dense-default text-(--text-subtitle)">
                            {t('affiliate_earning_label')}
                        </span>
                        {isLoadingStats ? (
                            // Reserve the row at its real height and put the bar inside, so the
                            // card does not resize when the figure lands.
                            <span className="flex h-[24px] items-center">
                                <Skeleton className="w-[64px]" />
                            </span>
                        ) : (
                            <span className="type-body-strong text-(--text-title)">
                                {earnings ?? UNKNOWN}
                            </span>
                        )}
                    </span>
                </div>

                <Icon
                    name="angle-right"
                    size={20}
                    className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                />
            </button>
        </section>
    )
}
