'use client'

import { useBalance } from '@features/balance'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { ClampedText } from '@shared/components/clamped-text'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatFiatAmount, formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { ListLeadingTile } from '@shared/ui/list'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import type { MembershipTarget } from '../../api/types'
import type { JoinCurrency, JoinMembershipFlow } from '../../hooks/join/use-join-membership'
import {
    MEMBERSHIP_IDENTITY_ART,
    MEMBERSHIP_JOIN_ART,
    MEMBERSHIP_LIVE_CHAT_GRADIENT,
    MEMBERSHIP_TIER_BG,
} from '../../lib/illustrations'
import { membershipChargedTotal, membershipFee } from '../../lib/membership-fee'

/**
 * Become a member → Confirm → Success.
 *
 * ## ⚠ Composed from DS primitives — this flow is not in the design system
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`, and the same three findings
 * `features/donation/components/donate-dialogs.tsx` records apply verbatim: `preview/sheet.html`
 * ships the three shapes (`form` / `confirm` / `success`) but its geometry is past the 256 KiB read
 * cap, and `shared/ui/dialog.tsx` carries the `.tevi-dialog` half. So this is that dialog plus DS
 * tokens.
 *
 * **It is deliberately the same screen as the donate flow**, down to the tile, the summary strip and
 * the pinned footer. Two priced actions on the same space page that looked like two different
 * products would be the drift this codebase keeps warning about — and the parts that genuinely
 * differ (no amount to choose, a tier card, a monthly cadence) are the parts that carry meaning.
 *
 * ## No amount, no currency picker
 *
 * A donation is a figure the reader chooses; a membership is a tier at the creator's price. So the
 * form is a **statement of what is being bought**, not a set of inputs — which is why it is short
 * enough to need no scroll region and no fixed height, unlike the donate dialog.
 */
export function BecomeAMemberDialogs({
    flow,
    target,
    memberCount,
}: {
    flow: JoinMembershipFlow
    /** Who is being joined. Identity only — see `MembershipTarget`. */
    target: MembershipTarget
    /**
     * Members, from the stats service. Kept off the target because it is the one figure that moves
     * while the dialog is open, and a target is assembled once.
     */
    memberCount?: number | null
}) {
    const { t, currentLanguage } = useTranslation()
    // The figure itself is never printed — only whether it covers the price, and the shortfall.
    const { isKnown, hasEnoughStars, starShortfall } = useBalance()
    const offer = flow.offer
    /*
     * The slug is the fallback rather than a blank: an unnamed space still has to be addressable in
     * "Become a member of …", and the call site should not have to pre-resolve it (channel, post,
     * live and DM would each pick their own default).
     */
    const creator = target.name ?? target.slug
    const avatarUrl = target.avatarUrl

    if (!offer) return null

    const price = formatStarAmount(offer.stars, currentLanguage)
    /*
     * A Star shortfall only matters when paying **in Star**. Unscoped, it disabled the Cash tab's
     * Join too — a reader with 0 Star could not pay $1.00 by card, the one route that needs no Star.
     */
    const short = flow.currency === 'star' && isKnown && !hasEnoughStars(offer.stars)
    const tierName = offer.name ?? t('membership_tier_fallback')
    const cashPrice =
        offer.usd == null ? '' : formatFiatAmount(offer.usd, MEMBERSHIP_USD, currentLanguage)

    return (
        <>
            {/* ── Become a member ────────────────────────────────────────────────────── */}
            <Dialog open={flow.step === 'details'} onOpenChange={open => !open && flow.close()}>
                {/*
                 * Same two-part shape as the donate dialog: a scrolling body and a pinned block of
                 * notice + button. This screen is legacy's **offer page**, not a confirm — a tier
                 * card, a pitch, two benefit rows and an identity row — so it is the taller of the
                 * two and the one that needs the treatment. `max-h`, not a fixed height: nothing
                 * here changes size while the reader reads, so the dialog sizes to its content and
                 * clamps only on a short window.
                 */}
                <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4">
                    {/*
                     * `[&>*]:shrink-0` — **a scroll container must scroll, not squash.**
                     *
                     * Flex items shrink by default, and every block in here is one. On a short
                     * window the column runs out of room and flex takes it out of the children
                     * instead of overflowing: measured on a 390×780 phone, the tier card went
                     * from 75px to **26px** with 49px of text inside it, and `overflow-hidden`
                     * cropped the name and the price. It read as a broken card and was a
                     * missing class.
                     *
                     * On the wrapper rather than on each block, because the rule is about being
                     * *in* a scroll container, not about any one child.
                     */}
                    <div className="flex min-h-0 flex-auto flex-col gap-4 overflow-y-auto [&>*]:shrink-0">
                        <DialogHeader>
                            <JoinTile avatarUrl={avatarUrl} name={creator} />
                            <DialogTitle>
                                {t('membership_join_title', { name: creator })}
                            </DialogTitle>
                            {/*
                             * Legacy shows the member count only above zero, and it is right to: "0
                             * members" on an invitation to join is an argument against joining.
                             */}
                            {typeof memberCount === 'number' && memberCount > 0 && (
                                <DialogDescription>
                                    {t('membership_member_count', { count: memberCount })}
                                </DialogDescription>
                            )}
                        </DialogHeader>

                        {/*
                         * Legacy's currency radio group, as the DS `SegmentedControl` — this is a
                         * **value**, not a pair of actions, and the component is what carries
                         * `role="tablist"`, roving arrow keys and one tab stop. Shown only when the
                         * creator priced the tier in cash; a single-option picker is a control that
                         * cannot be used.
                         */}
                        {flow.offersCash && (
                            <SegmentedControl aria-label={t('membership_currency_label')}>
                                {CURRENCIES.map(option => (
                                    <SegmentedControlItem
                                        data-testid="membership-currency"
                                        data-currency-code={option}
                                        key={option}
                                        selected={flow.currency === option}
                                        onClick={() => flow.changeCurrency(option)}
                                    >
                                        <SegmentedControlItemLabel>
                                            {t(`membership_currency_${option}`)}
                                        </SegmentedControlItemLabel>
                                    </SegmentedControlItem>
                                ))}
                            </SegmentedControl>
                        )}

                        {/*
                         * The tier card — name over price over cadence, with legacy's own
                         * illustration bled to the trailing edge. Legacy pins it `position: absolute`
                         * at `right: 10px; bottom: -15px`, i.e. deliberately cropped by the card; a
                         * flex child with a negative inline-end margin is the same picture without a
                         * positioned ancestor, and it mirrors in Arabic where `right` would not.
                         */}
                        {/*
                         * Legacy's illustrated card: the artwork `cover`-fills it and the border is
                         * its own lavender hairline (`#dcd1f2` → `--separator-default`, the token
                         * every other hairline in the app uses; the literal could not flip).
                         *
                         * ⚠ The URL travels as a **custom property**, and the image is applied by a
                         * class that reads it. Setting `backgroundImage` in the `style` prop looks
                         * simpler and cannot be themed: an inline style beats every class, so
                         * `dark:bg-none` was ignored and Dark got the pale artwork anyway —
                         * measured, both themes reported the same `background-image`. As a variable
                         * it is class-versus-class and the dark variant wins on order.
                         *
                         * The URL is built from `NEXT_PUBLIC_STATIC_DOMAIN`, so it cannot be an
                         * arbitrary background-image utility either — Tailwind needs the string at
                         * build time.
                         *
                         * ⚠ And that sentence cannot *name* the utility. Tailwind v4 scans source as
                         * plain text and does not know what a comment is: spelling the class out here
                         * made it a **candidate**, so the compiler emitted a real rule whose URL was
                         * the ellipsis, and Turbopack failed to resolve it — `globals.css` threw
                         * `Module not found: Can't resolve '…'` and **every route 500'd**. A class name
                         * in a comment is a class name.
                         */}
                        <div
                            style={{ '--tier-bg': `url(${MEMBERSHIP_TIER_BG})` } as CSSProperties}
                            className="flex items-center justify-between gap-2 overflow-hidden rounded-lg border border-(--separator-default) bg-(--background-segment) bg-[image:var(--tier-bg)] bg-center bg-cover bg-no-repeat px-4 py-3 dark:bg-none"
                        >
                            <span className="flex min-w-0 flex-col gap-1">
                                <span className="type-dense-emphasis truncate text-(--text-title)">
                                    {tierName}
                                </span>
                                <span className="flex items-baseline gap-1">
                                    {flow.currency === 'cash' ? (
                                        <span className="type-body-strong text-(--text-title) tabular-nums">
                                            {cashPrice}
                                        </span>
                                    ) : (
                                        <>
                                            <StarMark />
                                            <span className="type-body-strong text-(--text-title) tabular-nums">
                                                {price}
                                            </span>
                                        </>
                                    )}
                                    <span className="type-dense-default text-(--text-subtitle)">
                                        {t('membership_per_month')}
                                    </span>
                                </span>
                            </span>
                            <Image
                                src={MEMBERSHIP_JOIN_ART}
                                alt=""
                                aria-hidden
                                width={72}
                                height={97}
                                className="-me-2 -mb-4 h-auto w-[72px] flex-none self-end"
                            />
                        </div>

                        {/*
                         * The creator's own pitch. Untranslated by nature and rendered as **text** —
                         * the same rule `thank_you_msg` follows in `features/donation`, for the same
                         * reason: a profile field is not a template to interpolate markup from.
                         *
                         * Clamped to **two** lines behind "more", because there is no length limit on
                         * this field and the dialog's own height is capped: a long pitch pushed the
                         * benefits, the identity previews and the Join button below the scroll, so the
                         * screen stopped saying what pressing it would buy. Two rather than the bio's
                         * three for the same reason — here a line of pitch costs a line of the thing
                         * being bought. Same component as the channel header's bio
                         * (`shared/components/clamped-text.tsx`) — one measured overflow, not two.
                         */}
                        {offer.description && (
                            <ClampedText
                                testId="membership-description-expand"
                                text={offer.description}
                                lines={2}
                                moreLabel={t('common_show_more')}
                                lessLabel={t('common_show_less')}
                                className="type-dense-default text-(--text-body)"
                            />
                        )}

                        <Section title={t('membership_benefits_title')}>
                            {/* Legacy's order: live, then post, then chat. */}
                            <GlyphRow icon="signal-stream" label={t('membership_benefit_live')} />
                            <GlyphRow icon="image" label={t('membership_benefit_post')} />
                            <GlyphRow icon="chat" label={t('membership_benefit_chat')} />
                        </Section>

                        {/*
                         * Two labelled pictures, not a glyph row: the section answers "what will
                         * people see next to my name", so it shows the badge rather than naming it.
                         * See `MEMBERSHIP_IDENTITY_ART` for why the `premium` glyph that stood here
                         * was wrong about both the count and the product.
                         */}
                        <Section title={t('membership_identity_title')}>
                            <IdentityRow
                                label={t('membership_identity_live_chat')}
                                art={MEMBERSHIP_IDENTITY_ART.liveChat}
                                /* Legacy's wash, and it is artwork rather than a surface — the
                                   strip is drawn to read against exactly this. */
                                background={MEMBERSHIP_LIVE_CHAT_GRADIENT}
                            />
                            <IdentityRow
                                label={t('membership_identity_badge')}
                                art={MEMBERSHIP_IDENTITY_ART.postComments}
                            />
                        </Section>

                        {/*
                         * No total on this screen. It is the **offer** — a price the reader is
                         * deciding about, restated in the tier card two rows up — and a bordered
                         * summary of a figure nobody has committed to yet is the same duplication
                         * `features/donation` took off its own form. The confirm carries it.
                         */}
                    </div>

                    <div className="-mx-6 flex flex-col gap-3 border-(--separator-default) border-t px-6 pt-4">
                        {/*
                         * Said once, next to the control it disables — and it now means something
                         * narrower than it used to. Card payment **works**; what this covers is a
                         * surface where it cannot run: a `/app/*` webview mounts no
                         * `PaymentProvider` (the native app must use IAP), or the tier carries a
                         * cash amount with no price id to charge against. "…isn't available **yet**"
                         * was true while the payment feature was being built and is not any more.
                         */}
                        {flow.currency === 'cash' && !flow.isCashAvailable && (
                            <p className="type-caption-meta text-(--text-subtitle)">
                                {t('membership_cash_unavailable')}
                            </p>
                        )}
                        <DialogFooter>
                            <Button
                                data-testid="membership-join-review"
                                variant="accent"
                                size="large"
                                disabled={!flow.canJoin || short}
                                onClick={flow.review}
                            >
                                {/* The row's own button glyph — see `become-a-member-button.tsx`
                                    for why it is the bare `crown` and not Premium's hexagon. The
                                    two are one press apart, so they cannot disagree. */}
                                <Icon name="crown" weight="filled" size={20} />
                                {/* Legacy's own label on this button — "Become a member" is the
                                    row's wording, and repeating it here says nothing new. */}
                                {t('membership_join_cta')}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Confirm ────────────────────────────────────────────────────────────── */}
            {/*
             * Cancel first in the DOM, so focus and Escape land on the answer that changes nothing,
             * and `isJoining` disables **both** — the write is running and an enabled Cancel would
             * suggest it can be called off. Cancel goes **back**, not out: the reader keeps the
             * screen they were on. All three rules are `ConfirmDialog`'s, kept while replacing it,
             * because a money confirm has to restate the figure and that component takes one
             * sentence.
             */}
            <Dialog open={flow.step === 'confirm'} onOpenChange={open => !open && flow.back()}>
                <DialogContent>
                    <DialogHeader>
                        <JoinTile avatarUrl={avatarUrl} name={creator} />
                        <DialogTitle>
                            {t('membership_confirm_title', { name: creator, tier: tierName })}
                        </DialogTitle>
                        <DialogDescription>
                            {/*
                             * The one failure that is not a failure gets its own sentence: the
                             * backend answered with a card intent this app cannot complete. Saying
                             * "something went wrong" there would be false — nothing did.
                             */}
                            {/*
                             * Two transactions, two sentences — the same split
                             * `features/donation` needed. One shared line said "spends Star from
                             * your balance" on a screen that was about to charge a card.
                             */}
                            {flow.needsCard
                                ? t('membership_needs_card')
                                : flow.currency === 'cash'
                                  ? t('membership_confirm_body_cash')
                                  : t('membership_confirm_body_star')}
                        </DialogDescription>
                    </DialogHeader>

                    <Summary
                        stars={offer.stars}
                        usd={offer.usd}
                        currency={flow.currency}
                        shortfall={short ? starShortfall(offer.stars) : 0}
                    />

                    <DialogFooter layout="side-by-side">
                        <Button
                            data-testid="membership-join-back"
                            variant="secondary"
                            size="large"
                            disabled={flow.isJoining}
                            onClick={flow.back}
                        >
                            {t('common_cancel')}
                        </Button>
                        <Button
                            data-testid="membership-join-confirm"
                            variant="accent"
                            size="large"
                            disabled={flow.isJoining || flow.needsCard}
                            onClick={flow.confirm}
                        >
                            {t('membership_confirm_yes')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Success ────────────────────────────────────────────────────────────── */}
            <Dialog open={flow.step === 'success'} onOpenChange={open => !open && flow.close()}>
                <DialogContent>
                    <DialogHeader>
                        <JoinTile avatarUrl={avatarUrl} name={creator} />
                        <DialogTitle className="type-title-t2-semibold">
                            {t('membership_success_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('membership_success_body', { name: creator })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="rounded-lg bg-(--background-segment) px-4 py-3">
                        {/* Always Star: a card membership never reaches this screen — the dialog
                            closes and `PaymentProvider` owns the outcome from there. */}
                        <Row
                            label={t('membership_success_paid')}
                            value={price}
                            currency="star"
                            strong
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            data-testid="membership-join-close"
                            variant="accent"
                            size="large"
                            onClick={flow.close}
                        >
                            {t('membership_done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

/**
 * The dialog's 60×60 illustration slot — the membership art with the creator badged onto it.
 *
 * The same composition, and the same reasoning, as `features/donation`'s `ArtTile`: the screen's
 * subject is one particular person, so the picture says which one. The badge appears only when there
 * is a photo — `Avatar`'s `type="initials"` carries no fill of its own in this port, so an initials
 * fallback would float two bare letters on the tile (see that file's note).
 */
function JoinTile({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
    return (
        <span className="relative inline-flex size-[60px] items-center justify-center rounded-lg bg-(--background-segment)">
            <Image src={MEMBERSHIP_JOIN_ART} alt="" aria-hidden width={36} height={36} />
            {avatarUrl && (
                <span className="absolute -end-1 -bottom-1 rounded-[var(--radius-fill)] bg-(--background-subtle) p-0.5">
                    <AnimatedAvatar
                        thumb={avatarUrl}
                        alt=""
                        size="2xs"
                        initials={name.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </span>
            )}
        </span>
    )
}

/**
 * The price, and the shortfall when there is one.
 *
 * One row, no disclosure and no balance — the same shape `features/donation` settled on for its own
 * Star confirm. A tier is a price the creator set: nothing is added to it and nothing derives it, so
 * there is no working to fold away, and printing what the reader happens to hold beside it asks them
 * to do arithmetic nobody wanted.
 */
function Summary({
    stars,
    usd,
    currency,
    shortfall,
}: {
    stars: number
    /** The tier's cash price. `null` on a Star-only tier. */
    usd: number | null
    currency: JoinCurrency
    shortfall: number
}) {
    const { t, currentLanguage } = useTranslation()
    const cash = currency === 'cash'
    const fee = cash ? membershipFee(usd) : 0
    const total = cash ? membershipChargedTotal(usd) : stars

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 rounded-lg bg-(--background-segment) px-4 py-3">
                {/*
                 * ## Cash has a fee, and this row used to print the **Star** figure for it
                 *
                 * `Summary` formatted with `formatStarAmount` unconditionally, so the cash confirm
                 * showed the tier's Star price beside a star mark on a screen about to charge a
                 * card. Two errors in one row: the wrong number and the wrong unit.
                 *
                 * Cash is also the only side with working to show — the card is charged the price
                 * **plus a processing fee** (`lib/membership-fee.ts`), so the figure that leaves the
                 * account is not the one on the tier card. That is what earns the disclosure, and it
                 * is exactly the split `features/donation` settled on: fold the derivation away,
                 * show the total.
                 *
                 * Star has no fee and nothing to derive, so it stays one flat row.
                 */}
                {cash ? (
                    <details className="group/summary">
                        <summary className="flex cursor-pointer list-none items-center gap-2 outline-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)">
                            <Row
                                label={t('membership_total')}
                                value={formatFiatAmount(total, MEMBERSHIP_USD, currentLanguage)}
                                currency="cash"
                                strong
                                className="flex-auto"
                            />
                            <Icon
                                name="angle-down"
                                size={16}
                                aria-hidden
                                className="flex-none text-(--icon-secondary) transition-transform duration-[120ms] group-open/summary:rotate-180"
                            />
                        </summary>
                        <div className="flex flex-col gap-2 pt-2">
                            <Row
                                label={t('membership_price')}
                                value={formatFiatAmount(usd ?? 0, MEMBERSHIP_USD, currentLanguage)}
                                currency="cash"
                            />
                            <Row
                                label={t('membership_fee')}
                                value={formatFiatAmount(fee, MEMBERSHIP_USD, currentLanguage)}
                                currency="cash"
                            />
                        </div>
                    </details>
                ) : (
                    <Row
                        label={t('membership_total')}
                        value={formatStarAmount(total, currentLanguage)}
                        currency="star"
                        strong
                    />
                )}
            </div>
            {shortfall > 0 && (
                <p className="type-caption-meta text-(--text-error)">
                    {t('membership_short', {
                        amount: formatStarAmount(shortfall, currentLanguage),
                    })}
                </p>
            )}
        </div>
    )
}

function Row({
    label,
    value,
    currency,
    strong,
    className,
}: {
    label: ReactNode
    value: string
    /** Cash carries its symbol inside `value`; Star's mark is a picture beside it. */
    currency: JoinCurrency
    strong?: boolean
    className?: string
}) {
    return (
        <span className={cn('flex items-center justify-between gap-3', className)}>
            <span
                className={cn(
                    'min-w-0 truncate',
                    strong
                        ? 'type-dense-emphasis text-(--text-title)'
                        : 'type-dense-default text-(--text-subtitle)',
                )}
            >
                {label}
            </span>
            <span className="flex flex-none items-center gap-1">
                {currency === 'star' && <StarMark size={14} />}
                <span
                    className={cn(
                        'tabular-nums',
                        strong
                            ? 'type-body-strong text-(--text-title)'
                            : 'type-dense-default text-(--text-subtitle)',
                    )}
                >
                    {value}
                </span>
            </span>
        </span>
    )
}

/** The two options, in the order the picker shows them. Star first: it is the one that completes. */
const CURRENCIES = ['star', 'cash'] as const

/**
 * The one cash currency a tier is priced in.
 *
 * A literal rather than a lookup, for the reason `features/donation` gives about its own copy: the
 * cash line is `USD` by contract, and a currency picker for a field with one value would be a
 * control that cannot be used.
 */
const MEMBERSHIP_USD = { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 } as const

/** A titled block — legacy's "Your membership benefit" and "Your membership identity". */
function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            {/* 14/600, legacy's own weight for these two headings — `type-dense-strong`. It was
                `emphasis` (500), which left the heading and the rows under it the same weight. */}
            <h3 className="type-dense-strong text-(--text-title)">{title}</h3>
            <div className="flex flex-col gap-2">{children}</div>
        </section>
    )
}

/**
 * One line — a glyph on the leading edge, a sentence beside it.
 *
 * The glyph is true about the **noun** and the sentence supplies "members-only"; `lib/illustrations.ts`
 * records why there is no picture here and why legacy's inline paths were not copied.
 */
function GlyphRow({ icon, label }: { icon: 'signal-stream' | 'image' | 'chat'; label: string }) {
    return (
        <span className="flex min-w-0 items-center gap-3">
            {/*
             * ## The tile is `ListLeadingTile`, and reusing it is the point
             *
             * Bare glyphs at `--icon-secondary` sat too quietly for a list whose whole job is to
             * sell three things. The DS already draws a prominent leading glyph — a 32px rounded
             * tile, indigo with a white mark — and `shared/ui/list.tsx` ships it as the same
             * component the account drawer paints every one of its rows with. So this is that
             * component at its **default** tone rather than a tinted box invented here, which is
             * also what stops it drifting from those rows.
             *
             * The tone is set through `--tevi-left-bar-tile`, the same hook the drawer uses for its
             * eight colours, to **`--primary-600`** — the drawer's own `TILE.primary`, i.e. this
             * app's established "brand purple tile" rather than a purple picked here. The default
             * is Indigo, which read as a stray blue on a screen whose every other accent is the
             * brand.
             *
             * `--primary-600` and not the CTA's `--primary-500`: 500 is pinned (`#501bc0` in both
             * themes) while 600 flips (`#4316a0` → `#8a4fe3`), so the tiles stay legible on the dark
             * card, and sitting a step off the button keeps them supporting it rather than
             * competing with it.
             *
             * One tone for all three: three benefits are one set, and three different colours would
             * imply a distinction the copy does not make.
             */}
            <ListLeadingTile className="[--tevi-left-bar-tile:var(--primary-600)]">
                <Icon name={icon} size={20} />
            </ListLeadingTile>
            {/*
             * `--text-title` at 14/500, which is legacy's `#1a1a1a` / `fontWeight: 500`.
             *
             * These were `--text-body` at 400 — a muted grey one weight down — which put the three
             * things this list exists to sell in the quietest text on the screen, beside the
             * loudest tiles on it. The identity rows below stay muted on purpose: those are captions
             * over a picture (legacy's `#666666` / 400), not the offer itself.
             */}
            <span className="type-dense-emphasis min-w-0 text-(--text-title)">{label}</span>
        </span>
    )
}

/**
 * A labelled illustration — legacy's identity rows.
 *
 * The card is **pinned light** rather than themed, and that is the same call the tier card's artwork
 * needs: these strips depict a light chat line and a light post comment, badge included, so a dark
 * card behind them would show a light UI floating on a dark plate. `#ffffff` is legacy's own value
 * for the second one; the first replaces it with the gradient.
 *
 * `h-auto` beside the intrinsic width is what keeps the aspect ratio — dropping it is how these
 * ended up as slivers the first time they were used.
 */
function IdentityRow({
    label,
    art,
    background,
}: {
    label: string
    art: { src: string; width: number; height: number }
    background?: string
}) {
    return (
        <span className="flex flex-col gap-2">
            <span className="type-dense-default text-(--text-subtitle)">{label}</span>
            <span
                className="flex items-start overflow-hidden rounded-lg bg-white px-4 py-3 shadow-sm"
                style={background ? { background } : undefined}
            >
                <Image
                    src={art.src}
                    alt=""
                    aria-hidden
                    width={art.width}
                    height={art.height}
                    className="h-auto max-w-full"
                />
            </span>
        </span>
    )
}
