'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { type Currency, convertFromUsd, formatFiatAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { Subscriber } from '../api/types'
import { formatMemberDate } from '../lib/member-date'
import { memberPrice } from '../lib/membership-tier'

/**
 * Two letters for an avatar with no picture — the same fallback every other avatar in this app
 * draws, and what `Avatar`'s initials type is for (its ground means the circle is never an empty
 * ring). Empty for a member with no readable name, which drops to the placeholder glyph instead.
 */
function initialsOf(name: string): string | undefined {
    const trimmed = name.trim()
    return trimmed ? trimmed.slice(0, 2).toUpperCase() : undefined
}

/**
 * One paying member — avatar, name, handle, next-charge date, and what they pay.
 *
 * ## The row is a link, and the row is the target
 *
 * It goes to the member's space (`/@{slug}`), which is the only address this screen can build and
 * the only one that exists. A `Link` rather than a `div` with a handler, so it is middle-clickable
 * and announced as a link — the same rule `ActionRows` states. A member whose payload carried **no
 * slug** renders as a plain row instead: there is nothing to navigate to, and a link to `/@null` is
 * the failure that rule exists to prevent.
 *
 * ## The message button is present and **disabled**, which is the honest state
 *
 * Legacy's row has a Send-message control going to `/@{slug}/messages`. Direct messages are not
 * ported, so there is no such route — and `docs/DEFINITION_OF_DONE.md` §13 is explicit that a
 * disabled-pending-route control is still tagged, because *"this is disabled" is an assertion, and an
 * untagged dead control is indistinguishable from a regression*. So the slot is kept, the button is
 * really `disabled`, and the reason is its accessible description. It becomes live by giving it an
 * `href` and nothing else.
 *
 * It is **outside** the row's `Link`: an interactive control inside an anchor is invalid HTML and
 * gives a keyboard reader two stops for one thing — the same union `PromoCard` enforces with types.
 *
 * ## The price is what *this member* pays, in both units
 *
 * `package_price`, not the tier's current price: a creator who raised their price still charges
 * existing members the old amount until they renew, so reading the tier here would misreport every
 * grandfathered row.
 *
 * ⚠ **Both units, and a `USD` row is a real row.** This shipped once rendering the Star line only
 * when `package_price_currency` was `TVS`, on the reasoning that converting a cash row would
 * hard-code a rate into a display of somebody's payment. That was wrong twice over: real rows are
 * priced in `USD`, so the whole price line disappeared and a creator could not see what they were
 * being paid — and the app already *had* the answer, in `features/membership`'s `membershipPrice`,
 * which derives the missing unit and returns `null` only when the payload is genuinely unusable.
 * `memberPrice` is that decision restated on this side of the boundary.
 *
 * The cash line is in the **reader's chosen currency**, like every other figure in this app.
 * `useCurrency` is called once by the dashboard and the unit passed down, rather than each row
 * mounting its own copy of a hook that would answer the same thing for all of them.
 */
export function MemberRow({
    member,
    currency,
    rate,
}: {
    member: Subscriber
    /** The unit the cash line is shown in — the reader's, not the payment's. */
    currency: Currency
    /** USD → `currency`. `1` while unknown, so the figure degrades to USD rather than vanishing. */
    rate: number
}) {
    const { t, currentLanguage } = useTranslation()

    const user = member.user
    const slug = user?.channel_slug ?? null
    const displayName = user?.display_name ?? member.package?.name ?? ''
    const nextCharge = formatMemberDate(member.end_date, currentLanguage)

    const price = memberPrice(member.package_price, member.package_price_currency)

    const body = (
        <>
            {/*
             * `AnimatedAvatar`, not `Avatar` + an `<Image>` assembled here.
             *
             * The hand-built version shipped **square**, and the reason is worth writing down
             * because it is not visible in the markup: `AVATAR_BASE` is `overflow-visible` on
             * purpose (a ring or a badge is allowed to overhang), so the circle does **not** come
             * from the wrapper clipping its child — it comes from the child carrying
             * `rounded-[inherit]`, which is what `avatarImageClass` exists to supply. An image with
             * `size-full object-cover` and nothing else fills a round box with a square picture, and
             * every check but the eye passes.
             *
             * Using the app's own avatar is the fix that cannot regress: it owns the three fallbacks
             * (image → initials → placeholder), the 48px `large` box, and the Premium animation a
             * paying member may well have — which the hand-built one silently dropped.
             */}
            <AnimatedAvatar
                size="large"
                thumb={user?.avatar?.thumb ?? null}
                alt=""
                initials={initialsOf(displayName)}
                className="flex-none"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1">
                    <span className="type-body-strong truncate text-(--text-title)">
                        {displayName}
                    </span>
                    {user?.channel_verified_tick_badge?.image ? (
                        <VerifiedBadge image={user.channel_verified_tick_badge.image} size={16} />
                    ) : null}
                    {slug ? (
                        <span className="type-dense-default truncate text-(--text-body)">
                            @{slug}
                        </span>
                    ) : null}
                </div>

                {nextCharge ? (
                    <p className="type-dense-default m-0 text-(--text-body)">
                        {t('monetization_membership_next_charge')}{' '}
                        <span className="type-dense-emphasis text-(--text-title)">
                            {nextCharge}
                        </span>
                    </p>
                ) : null}

                {price ? (
                    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                        <span className="flex items-center gap-0.5">
                            {/* Decorative: the figure beside it is the fact, and the cash line says
                                the unit out loud. */}
                            <StarMark size={12} />
                            <span className="type-dense-strong text-(--text-title)">
                                {price.star.toLocaleString(currentLanguage)}
                            </span>
                        </span>
                        <span className="type-caption-meta text-(--text-body)">
                            (
                            {formatFiatAmount(
                                convertFromUsd(price.usd, rate),
                                currency,
                                currentLanguage,
                            )}
                            )
                        </span>
                    </span>
                ) : null}
            </div>
        </>
    )

    return (
        <div
            data-testid="monetization-membership-member"
            data-membership-id={member.id}
            className="flex items-center gap-3 py-3"
        >
            {slug ? (
                <Link
                    href={`/@${slug}`}
                    className={cn(
                        'flex min-w-0 flex-1 items-center gap-3 rounded-xl',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                >
                    {body}
                </Link>
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
            )}

            <button
                type="button"
                disabled
                data-testid="monetization-membership-member-message"
                aria-label={t('monetization_membership_message')}
                aria-describedby={`member-message-${member.id}`}
                className={cn(
                    'flex size-10 flex-none cursor-not-allowed items-center justify-center rounded-xl',
                    'border border-(--separator-default) text-(--icon-secondary) opacity-40',
                )}
            >
                <span id={`member-message-${member.id}`} className="sr-only">
                    {t('monetization_membership_message_unavailable')}
                </span>
                <Icon name="send" size={20} />
            </button>
        </div>
    )
}
