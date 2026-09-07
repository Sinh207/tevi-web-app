'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { Avatar, AvatarPlaceholder, avatarImageClass } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import Link from 'next/link'
import type { MembershipChannel } from '../../api/types'
import type { MembershipCharge } from '../../hooks/webview/use-membership-checkout'
import type { CashOffer } from '../../lib/cash-offer'

/**
 * **What is being bought, and what the card will be charged** — one surface, not three.
 *
 * The first pass stacked a creator card, an order-summary card and a loose legal paragraph: three
 * boxes of equal visual weight, so nothing was primary and the eye had no order to read them in. They
 * are one thought — *you are joining this tier, for this much, on these terms* — so they are one card,
 * with an internal rule where the subject ends and the money begins.
 *
 * Legacy's own summary (`membershipDetails/components/checkout/orderSummary`) has the same three
 * parts. What changes here is the arrangement, the tokens (it paints `#2fc062`, `#1a1a1a`, `#666666`
 * by hand, so it is white in an app that is in dark mode) and the arithmetic's source.
 *
 * ## The three figures arrive reconciled, and nothing is derived here
 *
 * `chargeOf` (in the hook) does the reconciling: the **price** is the tier's, the **total** is the
 * backend's own `payment.amount` once the intent exists, and the **fee** is the difference — so the
 * three lines add up and the figure agreed to is the figure the gateway was asked for. Until then it
 * falls back to `cashOffer`'s arithmetic over the hard-coded rate (**B71**).
 *
 * Legacy recomputes the expression inline at the call site and guards the total with `feeUSD > 0`, so
 * a tier whose fee rounds to zero prints **Total $0** underneath a real price.
 *
 * ## Every figure goes through one formatter
 *
 * `formatFiatAmount(…, DEFAULT_CURRENCY)` — the same function the wallet and the earnings report use,
 * so `$5.62` is `$5.62` everywhere and the reader's own digit grouping applies. Legacy writes
 * `${new Intl.NumberFormat().format(amountUSD)}`, whose default has *no* minimum fraction digits: a
 * `$5.00` tier prints as **$5** beside a `$5.63` total, and the `$` is a literal outside the
 * formatter, so a locale that puts the symbol last still gets it first.
 *
 * `dir="ltr"` on every figure: an amount is not mirrored in Arabic, and the labels beside them are.
 */
export function OrderCard({
    offer,
    charge,
    channel,
    slug,
}: {
    offer: CashOffer
    /** The three figures, reconciled against the backend's own total — see `chargeOf`. */
    charge: MembershipCharge
    /** The space. `null` only while the profile is in flight, or if it could not be read. */
    channel: MembershipChannel | null
    slug: string
}) {
    const { t, currentLanguage } = useTranslation()

    const money = (value: number) => formatFiatAmount(value, DEFAULT_CURRENCY, currentLanguage)
    const total = money(charge.total)

    /*
     * The handle stands in only while the profile is loading, or if it could not be read at all. The
     * slug comes off this screen's own URL, so the header always names somebody — where legacy, which
     * makes the same fetch, renders an **empty** name until it lands.
     */
    const name = channel?.name ?? (slug ? `@${slug}` : '')
    const avatar = channel?.images?.thumb ?? null
    const verified = channel?.verified_tick_badge?.image ?? null

    return (
        <section
            aria-label={t('payment_order_summary_title')}
            className="flex flex-col rounded-(--radius-xl) bg-(--background-surface) shadow-xs"
        >
            {/* Who is being paid, and for what. */}
            <div className="flex items-center gap-3 p-4">
                {avatar ? (
                    <Avatar size="medium" type="image" className="flex-none overflow-hidden">
                        <Image
                            src={avatar}
                            alt=""
                            width={40}
                            height={40}
                            className={avatarImageClass}
                        />
                    </Avatar>
                ) : (
                    <Avatar size="medium" type="placeholder" className="flex-none">
                        <AvatarPlaceholder
                            size="medium"
                            className="flex items-center justify-center"
                        >
                            <Icon name="user-simple-alt" weight="filled" size={20} aria-hidden />
                        </AvatarPlaceholder>
                    </Avatar>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="type-dense-strong flex min-w-0 items-center gap-1 text-(--text-title)">
                        <span className="min-w-0 truncate">{name}</span>
                        {/* The badge *image* is the fact — an unverified account still sends the
                            object. Mirror of `MembershipRow` and `ChannelVerifiedMark`. */}
                        <VerifiedBadge image={verified} size={16} />
                    </span>
                    <span className="type-caption-meta min-w-0 truncate text-(--text-subtitle)">
                        {offer.name ?? t('membership_tier_fallback')}
                    </span>
                </div>
            </div>

            <Rule />

            <dl className="m-0 flex flex-col gap-2 px-4 py-3">
                <Line label={t('membership_price')} value={money(charge.price)} />
                <Line label={t('membership_fee')} value={money(charge.fee)} />
            </dl>

            <Rule />

            {/* The total is the one figure anybody checks, so it is the only one at body weight. */}
            <dl className="m-0 flex items-center justify-between gap-3 px-4 py-3">
                <dt className="type-body-strong text-(--text-title)">{t('membership_total')}</dt>
                <dd dir="ltr" className="type-body-strong m-0 text-(--text-title)">
                    {total}
                </dd>
            </dl>

            <Rule />

            <div className="flex flex-col gap-1 p-4">
                {/*
                 * The renewal sentence carries the **total**, which is what will actually be taken,
                 * not the tier price. Legacy says the same thing at the same figure; what is kept as
                 * legacy states it rather than derived is the *term*, because nothing in the payload
                 * says the period (B85).
                 */}
                <p className="type-caption-meta m-0 text-pretty text-(--text-subtitle)">
                    {t('membership_checkout_renewal', { amount: total })}
                </p>
                <LegalLine />
            </div>
        </section>
    )
}

function Rule() {
    return <div className="h-px w-full flex-none bg-(--separator-default)" />
}

function Line({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="type-caption-meta text-(--text-subtitle)">{label}</dt>
            <dd dir="ltr" className="type-caption-meta m-0 text-(--text-title)">
                {value}
            </dd>
        </div>
    )
}

/**
 * The consent line — the **same sentence and the same two keys** as the sign-in screen's.
 *
 * Reused rather than re-authored: it is the same promise about the same two documents, already
 * translated into all nine locales, and a second wording would be a second thing to keep in step.
 *
 * It sits **inside** this card, under the renewal sentence, rather than floating between the card and
 * the payment panel — where it read as a fourth unowned block. Both are facts about the charge, so
 * they belong to the thing that states the charge.
 *
 * Both links point at `/app/*`: this document is inside the app's WebView, and the website twins
 * would land the reader on the public site with the full shell around them. Legacy sends
 * `TeviJS.executeLink` to `https://webview.integridata.xyz/terms` — a vendor host, in production copy.
 */
function LegalLine() {
    const { t } = useTranslation()
    return (
        <p className="type-caption-meta m-0 text-pretty text-(--text-subtitle)">
            {t('auth_legal_prefix')}{' '}
            <Link
                data-testid="membership-order-terms"
                href="/app/terms"
                className="text-(--text-link) underline hover:no-underline"
            >
                {t('auth_legal_terms')}
            </Link>{' '}
            {t('auth_legal_and')}{' '}
            <Link
                data-testid="membership-order-privacy"
                href="/app/privacy"
                className="text-(--text-link) underline hover:no-underline"
            >
                {t('auth_legal_privacy')}
            </Link>
            .
        </p>
    )
}
