'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatCount } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import type { CampaignStats, Program } from '../api/types'
import { formatAffiliateMoney, formatCommissionRate } from '../lib/format'
import { ProgramAvatar } from './program-avatar'
import { ViewProgramChip } from './view-program-chip'

/** The app's "not known" figure, same as the account drawer's and the Star pill's. */
const UNKNOWN = '—'

/**
 * One of the two figures in the stats card, in its three states: loading, known, and not known.
 *
 * The third is the one that is easy to miss — a stats request that failed leaves the figure unknown
 * for good, so a skeleton would breathe for the rest of the session. Never a zero: a creator with
 * earnings should not read `$0.00` because a request is in flight.
 */
function Figure({
    label,
    value,
    isLoading,
}: {
    label: string
    value: string | null
    isLoading: boolean
}) {
    return (
        <div className="flex flex-1 flex-col items-center gap-1">
            <span className="type-dense-default text-(--text-subtitle)">{label}</span>
            {isLoading ? (
                <span className="flex h-[24px] items-center">
                    <Skeleton className="w-[56px]" />
                </span>
            ) : (
                <span className="type-body-strong text-(--text-title)">{value ?? UNKNOWN}</span>
            )}
        </div>
    )
}

/**
 * The screen after a join, and the screen the promoting card opens: the link, the figures, the way
 * out.
 *
 * **Success is a screen, not a toast** — the app's stated rule (`change-password-form.tsx`), and it
 * is why joining lands here rather than closing the dialog with a green flash.
 *
 * ## The referral link is copied, not shared
 *
 * Legacy opens its share sheet, which this app has not ported, and this control is inside a dialog
 * where a second overlay would fight it for focus. So the pill copies. The failure branch is
 * required rather than defensive: `navigator.clipboard` does not exist on insecure origins and can
 * be refused by permissions policy, so the URL goes into the error toast where it can be selected by
 * hand.
 *
 * Legacy also shortens the link first (`v1/shorten/`). Not ported — the pill truncates either way
 * and the long URL is what legacy itself falls back to when the shortener fails.
 *
 * ## Both figures go through the same formatter
 *
 * Legacy runs the promoter count through a compact formatter and prints the referral count raw, so
 * `12,345` referrals renders unformatted next to `1.5k` promoters. Both are `formatCount` here.
 */
export function ProgramJoinedStep({
    program,
    referralUrl,
    stats,
    isLoadingStats,
    onCopyLink,
    onLeave,
    isLeaving,
}: {
    program: Program | null
    referralUrl: string | null
    stats: CampaignStats | null
    isLoadingStats: boolean
    onCopyLink: () => void
    onLeave: () => void
    isLeaving: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    const rate = formatCommissionRate(program?.commission_rate ?? null)
    const players = stats ? formatCount(stats.referee_count ?? 0) : null
    const earnings = stats ? formatAffiliateMoney(stats.total_earnings ?? 0, currentLanguage) : null

    return (
        <div className="flex flex-col items-center gap-4 px-4 pb-4">
            <div className="pt-3">
                <ProgramAvatar program={program} size="xl" px={64} />
            </div>

            <ViewProgramChip program={program} />

            <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="type-title-t1-bold text-(--text-title)">
                    {t('affiliate_joined_title')}
                </h2>
                <p className="type-dense-default text-(--text-body)">
                    {t('affiliate_joined_body', { name: program?.name ?? '', rate })}
                </p>
            </div>

            <section className="w-full rounded-xl bg-(--background-surface)">
                <div className="flex flex-col gap-1 p-3">
                    <div className="flex">
                        <Figure
                            label={t('affiliate_players')}
                            value={players}
                            isLoading={isLoadingStats}
                        />
                        <Figure
                            label={t('affiliate_earnings')}
                            value={earnings}
                            isLoading={isLoadingStats}
                        />
                    </div>
                    <p className="type-dense-default rounded-xl bg-(--background-subtle) p-3 text-(--text-subtitle)">
                        {t('affiliate_payout_note')}
                    </p>
                </div>

                {referralUrl ? (
                    <>
                        <hr className="border-(--separator-default)" />
                        <div className="p-3">
                            <div className="flex items-center gap-1 rounded-(--radius-fill) bg-(--background-subtle) ps-3 pe-1 py-1 shadow-[inset_0_0_0_1px_var(--separator-strong)]">
                                {/* `dir="ltr"` so a URL is not reordered in an RTL layout — a link
                                    read right-to-left is a different link. */}
                                <span
                                    dir="ltr"
                                    className="type-dense-default min-w-0 flex-1 truncate text-(--text-title)"
                                >
                                    {referralUrl}
                                </span>
                                <Button
                                    data-testid="affiliate-copy-link"
                                    variant="primary"
                                    size="small"
                                    className="flex-none rounded-(--radius-fill)"
                                    onClick={onCopyLink}
                                >
                                    <Icon name="pages" size={16} />
                                    {t('affiliate_copy_link')}
                                </Button>
                            </div>
                        </div>
                    </>
                ) : null}
            </section>

            {/* A real button, not legacy's clickable `Typography` — this is the one destructive
                action on the screen and it was not reachable by keyboard. */}
            <p className="type-dense-default flex flex-wrap items-center justify-center gap-1 text-center text-(--text-subtitle)">
                {t('affiliate_stop_prompt')}
                <Button
                    data-testid="affiliate-leave"
                    variant="ghost"
                    size="small"
                    className="type-dense-strong px-1 text-(--accents-error-active)"
                    onClick={onLeave}
                    disabled={isLeaving}
                >
                    {t('affiliate_leave_program')}
                </Button>
            </p>
        </div>
    )
}
