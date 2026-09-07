'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount, formatStarAmount } from '@shared/lib/money'
import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemHandle,
    ListUserItemInfo,
    ListUserItemMeta,
    ListUserItemName,
    ListUserItemNameRow,
    ListUserItemPreview,
} from '@shared/ui/list'
import type { ReactNode } from 'react'
import { type Membership, membershipChannelName } from '../../api/types'
import { formatMembershipDate, isMembershipEnding } from '../../lib/membership-date'
import { membershipPrice } from '../../lib/membership-price'
import { paymentMethodLabelKey, prettifyPaymentMethod } from '../../lib/payment-methods'

/**
 * One membership: the creator, when the term turns over, how it is paid, and what it costs.
 *
 * The DS `List/User Item` (2089:2965) with its `__cta` slot filled — the same 80px row the blocked
 * list and the conversation list use.
 *
 * ## Four decisions worth the words
 *
 * **Name and handle share the first line.** Figma gives the handle its own line, and this row cannot
 * afford it: it carries *two* meta lines (the date and the payment method), and name + handle + two
 * metas is four lines in a box drawn for three — 87px of text in 64px of content. Legacy already
 * draws name and handle together here, so this is its layout at the DS's geometry rather than a new
 * arrangement. `ListUserItemHandle` is `w-full` for the one-per-line case, overridden to `w-auto`
 * so it shrinks beside the name instead of pushing it out.
 *
 * **The date line changes meaning, not just its value.** A `canceled_at` means the reader has
 * cancelled and the term is running out, so `end_date` stops being the next charge and becomes the
 * expiry — the same date, a different promise. Printing "Next charge" over a cancelled membership
 * tells somebody they are about to be billed when they are not, which is the one error on this
 * screen that costs a support ticket. Legacy branches on the same field.
 *
 * **The row is one button, and it opens the detail dialog.** That is legacy's primary action here,
 * and it is now this one's. The identity block used to be an `<a>` to the creator's space; the space
 * is reachable from inside the dialog instead — one click deeper, in exchange for the detail, the
 * payment history and the cancel. Legacy wraps three separate `onClick` handlers around `div`s, none
 * of them focusable.
 *
 * One tab stop per row rather than two, and deliberately: an avatar-sized link beside a row-sized
 * button doubles the keyboard cost of a list whose rows are mostly identical, and a decorative avatar
 * turned into a link needs a name of its own that repeats the one on the line beside it.
 *
 * **The avatar animates for Premium creators.** `isPremium` is passed through rather than pinned
 * `false`, which is the opposite of `BlockedAccountRow`'s call and for the opposite reason: these are
 * people the reader chose to pay, on a screen they open deliberately and briefly. `AnimatedAvatar`
 * still plays only what is on screen, only outside reduced-motion, and only off a metered connection.
 */
export function MembershipRow({
    membership,
    rule,
    onOpen,
    /** Milliseconds of entrance delay. The list staggers its first screen only — see the view. */
    enterDelay = 0,
    locale,
}: {
    membership: Membership
    rule: boolean
    /**
     * Opens the detail dialog for this membership.
     *
     * **Optional, and the row is inert without it.** A function cannot cross the RSC boundary — a
     * server component passing one gets *"Event handlers cannot be passed to Client Component props"*
     * and the whole page falls back to client rendering with nothing visible. That is not hypothetical:
     * it is how `/dev/my-membership`'s static row sections broke the moment this prop became required.
     * Those sections want the row's *geometry*, not its behaviour, so they pass nothing and get a row
     * with no press target — which is also the honest thing to render.
     */
    onOpen?: () => void
    enterDelay?: number
    locale: string
}) {
    const { t } = useTranslation()

    const { channel } = membership
    const name = membershipChannelName(channel)
    const slug = channel?.slug ?? ''
    /** The handle stands in when the payload carried no name — never a blank first line. */
    const label = name || (slug ? `@${slug}` : t('my_membership_unknown_creator'))
    const verifiedImage = channel?.verified_tick_badge?.image ?? null

    const date = formatMembershipDate(membership.end_date, locale)
    /*
     * Shared with the detail dialog through `isMembershipEnding`, which is where the reasoning lives:
     * the two used to branch differently, so one row said "Next charge" over a date the other called
     * an expiry.
     */
    const isCancelled = isMembershipEnding(membership)
    const method = membership.payment_method
    const methodKey = paymentMethodLabelKey(method)
    const methodLabel = methodKey ? t(methodKey) : prettifyPaymentMethod(method)
    const price = membershipPrice(membership.package_price, membership.package_price_currency)
    /** The identity line, plus whichever of the two meta lines the payload can fill. */
    const lines = 1 + (date ? 1 : 0) + (methodLabel ? 1 : 0)

    const identity = (
        <ListUserItemNameRow className="w-full">
            <ListUserItemName premium={channel?.is_premium}>{label}</ListUserItemName>
            {/* The badge *image* is the fact, and the gate lives in `VerifiedBadge`: the payload
                object is present (`{}`) on an ordinary unverified account, so there is nothing to
                draw without art — no sprite fallback. */}
            <VerifiedBadge image={verifiedImage} size={24} />
            {/* `w-auto` overrides the part's own `w-full`, which is drawn for a handle that owns its
                line. Here it shares one with the name, so both truncate rather than one winning. */}
            {slug && (
                /*
                 * `dir="ltr"` on the handle, and it is a real bug fix rather than a nicety. `@` is a
                 * bidi-**neutral** character, so in an RTL paragraph `@ada` is laid out with the `@`
                 * at the visual *end* — the row reads `ada@`, which is not this person's handle.
                 * Isolating the span makes the latin run render as itself inside the Arabic row.
                 * (`blocked-account-row.tsx` has the same defect; it is not fixed here because a
                 * feature may not edit another feature's components.)
                 */
                <ListUserItemHandle dir="ltr" className="w-auto">
                    @{slug}
                </ListUserItemHandle>
            )}
        </ListUserItemNameRow>
    )

    return (
        <li
            className="animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none"
            style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            {/*
             * Two token overrides on the DS row, both forced by dark mode and both explained at
             * length in `blocked-account-row.tsx`: `--background-listing` is `--black` in Dark —
             * the same value as `--background` — so a row left alone repaints the page colour over
             * the card it sits in; and `--background-subtle` is the same `#18181b` as
             * `--background-surface` there, so the DS's hover would do nothing.
             */}
            <ListUserItem className="bg-(--background-surface) transition-colors hover:bg-(--background-segment)">
                <ListUserItemAvatar>
                    <AnimatedAvatar
                        size="large"
                        thumb={channel?.images?.thumb}
                        avatarVideo={channel?.images?.avatar_video}
                        isPremium={channel?.is_premium}
                        /*
                         * Decorative. It sits in its own column *outside* the link — the anchor wraps
                         * the identity block only — so it is a picture of somebody whose name is
                         * announced two elements later.
                         */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </ListUserItemAvatar>

                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    {/*
                     * The press target is the content column, not the `<li>`: the avatar sits in its
                     * own column outside it, so a full-row button would make a decorative picture part
                     * of the control's own box for no gain. `block w-full` and no padding of its own —
                     * the geometry stays `ListUserItemPreview`'s, which is what keeps this row exactly
                     * as tall as the skeleton standing in for it, and what makes the wrapper
                     * removable: with no `onOpen` the same preview renders with no button around it.
                     */}
                    <Pressable
                        onOpen={onOpen}
                        label={t('my_membership_detail_open', { name: label })}
                        testId="membership-row"
                        membershipId={String(membership.id)}
                    >
                        {/*
                         * `items-center` for a row with fewer than three lines, which is the DS's own
                         * instruction on this part: the 80px band is drawn for the full stack, so a row
                         * that lost its date or its payment method would otherwise leave 21px of air
                         * under the text and read as bottom-heavy. Counted rather than assumed — every
                         * line below drops itself when its field is missing, and a payload with neither
                         * a date nor a method is one identity line in a 64px box.
                         */}
                        <ListUserItemPreview className={lines < 3 ? 'items-center' : undefined}>
                            <ListUserItemInfo>
                                {identity}

                                {/* Both meta lines drop themselves rather than printing a label with
                                nothing after it — a "Payment method" with no method is worse than
                                one fewer line, and it is what legacy renders. */}
                                {date && (
                                    <ListUserItemMeta>
                                        {isCancelled
                                            ? t('my_membership_expiry_date', { date })
                                            : t('my_membership_next_charge', { date })}
                                    </ListUserItemMeta>
                                )}
                                {methodLabel && (
                                    <ListUserItemMeta>
                                        {t('my_membership_payment_method', { method: methodLabel })}
                                    </ListUserItemMeta>
                                )}
                            </ListUserItemInfo>

                            {/*
                             * The price, in both units, top-aligned as legacy draws it
                             * (`justifyContent: 'flex-start'` on its trailing stack).
                             *
                             * `ListUserItemCta` is a centred row by default — it is drawn for a single
                             * button — so the column and the end alignment are this row's, and `gap-0`
                             * keeps the two figures reading as one block rather than two lines.
                             *
                             * Absent entirely when the price could not be read, never `0`: see
                             * `membershipPrice`, which refuses to invent one.
                             */}
                            {price && (
                                <ListUserItemCta className="flex-col items-end gap-0">
                                    <span className="flex items-center gap-1">
                                        {/* Decorative: the figure beside it is the fact, and the unit is
                                        said out loud on the line below in the reader's currency. */}
                                        <StarMark />
                                        <span className="type-dense-strong text-(--text-title)">
                                            {formatStarAmount(price.star, locale)}
                                        </span>
                                    </span>
                                    <span className="type-caption-meta text-(--text-subtitle)">
                                        {t('my_membership_price_fiat', {
                                            amount: formatFiatAmount(
                                                price.usd,
                                                DEFAULT_CURRENCY,
                                                locale,
                                            ),
                                        })}
                                    </span>
                                </ListUserItemCta>
                            )}
                        </ListUserItemPreview>
                    </Pressable>
                </ListUserItemContent>
            </ListUserItem>
        </li>
    )
}

/**
 * The row's press target, or nothing at all.
 *
 * A component rather than an inline ternary because the alternative is duplicating the whole preview
 * block — sixty lines of geometry — once per branch, which is exactly how the two copies drift apart.
 * `display: contents` is deliberately **not** used to skip the wrapper: it removes the element from
 * layout, and this one is `w-full` inside a flex column where the preview needs a block to fill.
 */
function Pressable({
    onOpen,
    label,
    children,
    testId,
    membershipId,
}: {
    onOpen?: () => void
    label: string
    children: ReactNode
    /** Threaded in: the id belongs on the press target, and `membership` is not in scope here. */
    testId?: string
    membershipId?: string
}) {
    if (!onOpen) return <>{children}</>
    return (
        <button
            data-testid={testId}
            data-membership-id={membershipId}
            type="button"
            onClick={onOpen}
            aria-label={label}
            className="block w-full cursor-pointer border-0 bg-transparent p-0 text-start outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
        >
            {children}
        </button>
    )
}
