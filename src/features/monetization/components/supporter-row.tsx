'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { ClampedText } from '@shared/components/clamped-text'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { type Currency, convertFromUsd, formatFiatAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import Link from 'next/link'
import type { DonationRow } from '../api/donation-types'
import { donationAmountUsd, donationStatusDisplay } from '../lib/donation-setting'

/**
 * Two letters for an avatar with no picture — the same fallback every other avatar in this app
 * draws. Empty for a supporter with no readable name, which drops to the placeholder glyph.
 */
function initialsOf(name: string): string | undefined {
    const trimmed = name.trim()
    return trimmed ? trimmed.slice(0, 2).toUpperCase() : undefined
}

/**
 * One donation received — who sent it, what they said, its payout state and what it was worth.
 *
 * ## The row is a link only when there is somewhere to go
 *
 * `/@{slug}` is the one address this screen can build, and the schema does not promise `channel_slug`
 * at all (**B104**) — so a row that carries one is a `Link`, and a row that does not is a plain
 * `div`. Legacy binds `onClick` unconditionally and guards inside it, which gives every row a pointer
 * cursor and a press that silently does nothing for the rows without a slug.
 *
 * A `Link` rather than a `div` with a handler, for the reason `ActionRows` states: middle-clickable,
 * announced as a link, and openable in a new tab.
 *
 * ## The note is clamped by measurement, not by character count
 *
 * `description` is prose a stranger typed with no length this client can rely on. `ClampedText` is
 * the app's own two-line clamp and it only offers *more* when the text is **actually** overflowing —
 * which legacy's hand-rolled version does too, but with a hard-coded English `... Read more` and a
 * `linear-gradient(to right, transparent, #ffffff 20%)` fade that is white in dark mode.
 *
 * ⚠ Plain text, never `dangerouslySetInnerHTML`: this is supporter-authored and there is no
 * sanitiser in the repo (`docs/DEFINITION_OF_DONE.md` §8).
 *
 * ## The status is a `Badge`, and that is a contrast decision rather than a stylistic one
 *
 * Legacy paints the word in `#00C443` / `#FB3748` / `#0061FF` — bare accent ink on the panel. Against
 * a light panel `--accents-success-active` measures **2.32**, well under AA for 14px text, which is
 * the failure `docs/DESIGN_SYSTEM.md` §6b records and which is invisible in any light-mode
 * screenshot. `Badge` is the DS's own component for exactly this and paints the tint block
 * underneath, so the same three states read at full contrast in both modes.
 *
 * A status the client has no vocabulary for renders **nothing** rather than the raw wire value in
 * grey — see `donationStatusDisplay`.
 *
 * ## The figure is in the reader's currency, like every other figure in this app
 *
 * `useCurrency` is called once by the dashboard and the unit passed down, rather than each row
 * mounting its own copy of a hook that would answer the same thing for all of them —
 * `MemberRow`'s note, and the same two props. Legacy hard-codes a `$` in front of `usd_amount`.
 */
export function SupporterRow({
    row,
    currency,
    rate,
}: {
    row: DonationRow
    /** The unit the figure is shown in — the reader's, not the payment's. */
    currency: Currency
    /** USD → `currency`. `1` while unknown, so the figure degrades to USD rather than vanishing. */
    rate: number
}) {
    const { t, currentLanguage } = useTranslation()

    const user = row.user
    const slug = user?.channel_slug ?? null
    const displayName = user?.display_name ?? ''
    const status = donationStatusDisplay(row.payout_status)
    const usd = donationAmountUsd(row)

    const identity = (
        <>
            <AnimatedAvatar
                size="large"
                thumb={user?.avatar?.thumb ?? null}
                alt=""
                initials={initialsOf(displayName)}
                className="flex-none"
            />
            <div className="flex min-w-0 flex-1 items-center gap-1">
                <span className="type-body-strong truncate text-(--text-title)">{displayName}</span>
                {user?.channel_verified_tick_badge?.image ? (
                    <VerifiedBadge image={user.channel_verified_tick_badge.image} size="body" />
                ) : null}
                {slug ? (
                    <span className="type-dense-default truncate text-(--text-body)">@{slug}</span>
                ) : null}
            </div>
        </>
    )

    return (
        <div
            data-testid="monetization-donation-supporter"
            data-donation-id={row.id}
            className="flex flex-col gap-1 py-3"
        >
            <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {slug ? (
                        <Link
                            href={`/@${slug}`}
                            className={cn(
                                'flex min-w-0 items-center gap-3 rounded-xl',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                            )}
                        >
                            {identity}
                        </Link>
                    ) : (
                        <div className="flex min-w-0 items-center gap-3">{identity}</div>
                    )}

                    {row.description ? (
                        /*
                         * Indented past the avatar so the note reads as belonging to the name above
                         * it rather than to the row. 48 is `AnimatedAvatar`'s `large` box and 12 the
                         * gap, which is the same 60 the identity line above starts at.
                         *
                         * ⚠ The inset is on a **wrapper**, not on `className`. `ClampedText`'s
                         * `className` lands on its paragraph and not on its root, so an inset passed
                         * there indents the prose and leaves the *more* control at the row's edge —
                         * which looks like a stray link under the note rather than part of it. Only
                         * a rendered screenshot shows the difference.
                         */
                        <div className="ms-[60px]">
                            <ClampedText
                                testId="monetization-donation-supporter-note"
                                text={row.description}
                                lines={2}
                                moreLabel={t('common_show_more')}
                                lessLabel={t('common_show_less')}
                                className="type-dense-default text-(--text-body)"
                            />
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-none flex-col items-end gap-1">
                    {status ? (
                        <Badge size="small" status={status.tone}>
                            {t(status.labelKey)}
                        </Badge>
                    ) : null}
                    {usd === null ? null : (
                        <span className="type-body-strong text-(--text-title)">
                            {formatFiatAmount(convertFromUsd(usd, rate), currency, currentLanguage)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
