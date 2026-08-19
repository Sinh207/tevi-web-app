'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import type { Channel, ChannelStats as Stats } from '../api/types'
import { formatCompactCount, formatExactCount, formatIncomeUsd } from '../lib/channel-format'

/**
 * Followers · Members · Posts · Income+.
 *
 * ## One to four columns, never assumed to be four
 *
 * Legacy filters on `isShow`: a stat renders only when its count is **greater than zero**, and
 * income additionally requires `show_income`. So a new creator's header has one column, or none.
 * Any layout that divides the row into quarters would leave a lone "0 Followers" floating at 25%
 * width — hence `flex-1` per column rather than a grid.
 *
 * ## Income is gated by `show_income` alone — **not** by ownership
 *
 * This had an `isOwner &&` on it, which broke the feature it was trying to protect. `show_income` is
 * the creator's own **opt-in to publish** the number (`ms_custom_profile_w2_show_my_income`, "Show my
 * income"), so a creator who switches it on wants visitors to see it. Requiring ownership meant only
 * they ever did, i.e. the toggle did nothing. Legacy uses the identical condition in both its trees —
 * `showIncome && incomeUsd > 0`, no owner check — which is the evidence that the stats strip is one of
 * the parts that genuinely *does* look the same on both surfaces.
 *
 * The access rule is still the backend's: B18 asks whether `income_usd` reaches an anonymous caller at
 * all. If it does when `show_income` is false, no client-side check fixes it — the number is already on
 * the wire.
 *
 * ## Type comes from the DS, layout from legacy
 *
 * Figma measures the columns as "16 Semi Bold over 14 Regular in Text-Placeholder". Legacy draws
 * 14/18 bold over 12/14 regular in `#848484` — a different scale, and `#848484` is exactly what
 * `--text-placeholder` resolves to, which is what confirms the mapping. The DS wins on type, per
 * CLAUDE.md; legacy wins on the gap and the alignment, which Figma's single frame cannot show.
 */
export function ChannelStats({
    channel,
    stats,
    className,
}: {
    channel: Channel
    stats: Stats | null | undefined
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()

    /**
     * Rendered even before `stats` arrive — the strip is a separate microservice from the channel
     * (see `useChannelStats`), so it lands after the shell. `null` counts mean no column yet, and
     * the row keeps its reserved height rather than appearing and pushing the page down.
     */
    const columns = [
        {
            key: 'followers',
            count: stats?.follower_count,
            label: t('channel_stat_followers'),
            show: (stats?.follower_count ?? 0) > 0,
        },
        {
            key: 'members',
            count: stats?.member_count,
            label: t('channel_stat_members'),
            show: (stats?.member_count ?? 0) > 0,
        },
        {
            key: 'posts',
            count: stats?.post_count,
            label: t('channel_stat_posts'),
            show: (stats?.post_count ?? 0) > 0,
        },
        {
            key: 'income',
            count: stats?.income_usd,
            label: t('channel_stat_income'),
            show: channel.show_income && (stats?.income_usd ?? 0) > 0,
            currency: true,
        },
    ].filter(column => column.show)

    if (columns.length === 0) return null

    return (
        /*
         * `<dl>` because the pairing is the meaning: a screen reader should hear "Followers,
         * 241,356", not four numbers followed by four words. Four bare divs read as the latter.
         *
         * ## The column widths are three rules, and each one is load-bearing
         *
         * This strip renders **one to four** columns, and every simple answer is wrong for one of
         * those counts. Measured at 360px: the four labels need 63 + 62 + 36 + 58 = 219px of a 244px
         * strip, so there are **eight pixels of slack per gap** — while at two columns there are
         * over a hundred. Two problems in opposite directions, in the same row.
         *
         * - `flex-1` alone spreads whatever is there across the whole width. With two stats the pair
         *   ends up at opposite ends of the row, which is what prompted this ("khoảng cách giữa 2
         *   items quá xa"); with one, a lone "1 Posts" floats in the middle of the space three
         *   missing columns left behind.
         * - `justify-around` on content-sized columns is the same bug with extra steps: the slack
         *   becomes gaps rather than column width, so it still pushes two stats apart.
         * - A fixed gap large enough to look right at two columns (24px, 40px) **overflows at four**
         *   on a 360px phone. There is no single gap that serves both.
         *
         * So: start at the content (`flex-auto`), grow to fill, never past `96px`, and truncate
         * rather than overflow when even the content will not fit — packed from the avatar
         * outwards. Four columns fill the row evenly and fall back to their natural widths on
         * a narrow screen rather than clipping; two sit next to each other at a readable distance;
         * one sits beside the avatar looking deliberate. Legacy reaches the same shape by hand-tuning
         * MUI grid fractions per stat (3.5 / 3.5 / 2 / 3 of twelve), which fills exactly when all
         * four show and packs left when they do not — tuned to English label widths, which is the
         * part not worth porting across nine locales.
         *
         * A locale whose label is wider than 96px truncates at the cap rather than pushing the row
         * out. Verified at 320 / 360 / 390 / 430 / 540 / 612 / 768 / 899 with one, two and four
         * columns, in `en`, `vi` and `ar`: no horizontal scroll at any of them.
         */
        <dl className={cn('flex min-w-0 flex-1 items-end justify-start gap-2', className)}>
            {columns.map(column => {
                const exact = formatExactCount(column.count, currentLanguage)
                const display = column.currency
                    ? formatIncomeUsd(column.count, currentLanguage)
                    : formatCompactCount(column.count, currentLanguage)

                return (
                    /**
                     * `dt` before `dd` in the DOM, `flex-col-reverse` to draw the value on top.
                     *
                     * Not bikeshedding: a `dl`'s content model is *one or more `dt` followed by one
                     * or more `dd`*, so emitting the value first — which is what writing them in
                     * visual order does — is invalid HTML, and what it invalidates is precisely the
                     * pairing assistive technology relies on. Reversing with CSS keeps the markup
                     * correct and reads better aloud: "Followers, 241,356".
                     */
                    <div
                        key={column.key}
                        /*
                         * `flex-auto`, not `flex-1` — the difference is `flex-basis: auto` against
                         * `0`, and it is the whole behaviour. With basis `0` every column is sized
                         * purely by the free space, so four columns at 360px each get an equal 55px
                         * and truncate even though their natural 63/62/36/58 **fits**. With basis
                         * `auto` they start at their content and only move when there is a surplus
                         * or a deficit.
                         *
                         * Which means the shrink is real and has to be survivable: at 320px the four
                         * need 219px of a 204px strip. It used to be `min-w-fit`, which refuses to
                         * shrink — so the row pushed 15px past the viewport and the **whole page
                         * scrolled sideways**. `min-w-0` plus a truncating label degrades that to
                         * "Followe…" on a 320px phone, which is the trade worth making: a clipped
                         * word is a small loss, a horizontally scrolling page is a broken one.
                         */
                        className="flex min-w-0 max-w-[96px] flex-auto flex-col-reverse items-center justify-center"
                    >
                        <dt className="type-dense-default w-full truncate text-center text-(--text-placeholder)">
                            {column.label}
                        </dt>
                        <dd className="type-body-strong text-center text-(--text-title)">
                            {/*
                             * The compact form is lossy — `241K` is not a number anyone can act on.
                             * The exact count reaches a pointer through `title` and assistive tech
                             * through an `sr-only` sibling, rather than through `title` alone, which
                             * most screen readers do not announce. Legacy carries both
                             * `followerCount` and `followerCountDisplay` for the same reason.
                             */}
                            <span aria-hidden="true" title={column.currency ? undefined : exact}>
                                {display}
                            </span>
                            <span className="sr-only">{column.currency ? display : exact}</span>
                        </dd>
                    </div>
                )
            })}
        </dl>
    )
}
