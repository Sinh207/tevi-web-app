'use client'

import { toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount, formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { type ReactNode, useEffect, useState } from 'react'
import { type Membership, membershipChannelName } from '../../api/types'
import { useMembershipDetail } from '../../hooks/holdings/use-membership-detail'
import { useJoinMembership } from '../../hooks/join/use-join-membership'
import { formatMembershipDate, isMembershipEnding } from '../../lib/membership-date'
import { membershipPrice } from '../../lib/membership-price'
import { paymentMethodLabelKey, prettifyPaymentMethod } from '../../lib/payment-methods'
import type { RenewalOffer } from '../../lib/renewal'
import { BecomeAMemberDialogs } from '../join/become-a-member-dialogs'

/**
 * One membership in full — a **1:1 port of legacy's `components/membership/details`**, on this app's
 * tokens and primitives.
 *
 * ## The layout is legacy's, block for block
 *
 * `Stack p=16 gap=12` → a **card** → then the payment history beneath it:
 *
 * ```
 *  ┌ Dialog (Background - Subtle) ────────────────┐
 *  │  ✕   Membership detail                       │  title bar, fixed
 *  ├──────────────────────────────────────────────┤
 *  │ ┌ Card (Background - Elevated, radius lg) ─┐ │  ← legacy's MUI Card, radius 12
 *  │ │  ◯  Ada Lovelace ✓                       │ │  ← CardHeader: avatar 40 + name + @slug
 *  │ │     @ada                                 │ │
 *  │ │  Gold                                    │ │  ← package name
 *  │ │  ────────────────────────────────────    │ │  ← Divider
 *  │ │  Membership price          ★ 500 ($5)    │ │  ┐
 *  │ │  Next charge               Sep 01, 2026  │ │  ├ Grid spacing 1.5 (12px)
 *  │ │  Payment method            ★ Star        │ │  ┘  value carries a 20px mark
 *  │ │  ────────────────────────────────────    │ │
 *  │ │  If you want to cancel … press Cancel    │ │  ← the action band, in the card
 *  │ └──────────────────────────────────────────┘ │
 *  │ ┌ Card ────────────────────────────────────┐ │  ← a **second** card, same radius
 *  │ │  Payment history                         │ │
 *  │ │  ────────────────────────────────────    │ │
 *  │ │  Aug 01, 2025                   ★ 500    │ │  ┐ the only scrolling region
 *  │ │  Jul 01, 2025                   $4.99    │ │  ┘
 *  │ └──────────────────────────────────────────┘ │
 *  └──────────────────────────────────────────────┘
 * ```
 *
 * An earlier pass of this file put the figures straight on the dialog and pinned the action to a
 * bottom band. It read fine and it is not what the app draws, which is what this corrects.
 *
 * ## Only the payment history scrolls
 *
 * The body used to be one `overflow-y-auto` column, so a membership with a year of charges scrolled
 * the creator's name and the Cancel link out of view — the two things the dialog is *for*. Now the
 * body is a fixed column and the **rows** are the scroll container: the heading and its rule stay put
 * above them, and the card above stays put entirely.
 *
 * Mechanically that is `min-h-0` on every link in the chain plus a shrinkable history card, which is
 * what lets it be the part that gives way when the dialog reaches its `max-h`. Dropping any one
 * `min-h-0` makes a flex child refuse to go below its content height, and the scroll silently moves
 * back to the body.
 *
 * ## The history card is as tall as the card above it
 *
 * Two cards of the same width reading as one pair, so they are the same height: the ledger is given
 * the **measured** height of the detail card and scrolls inside it. It used to be `flex-1`, i.e.
 * "whatever is left", which meant its height was a by-product of the viewport — a year of charges made
 * it three times the card above on a desktop and a sliver on a short window, and the dialog's
 * proportions changed with the browser rather than with the content.
 *
 * Measured rather than a shared constant, because the detail card has no fixed height: it grows with a
 * cancelled membership's extra line and with the renew band, and any number written here would be
 * wrong for one of those. `ResizeObserver` covers all of it, and the pattern is
 * `channel-description.tsx`'s — a state-held node so the effect re-runs when the dialog mounts one.
 *
 * The match applies **only when there are rows**. Matching a loading spinner, an empty line or a retry
 * button to a 300px card would draw a large box around a small sentence; those three states stay their
 * own height, which is also what makes the transition into rows visible rather than a silent reflow.
 *
 * `flex: 0 1 <measured>` and not a `height`: the basis is the size it *wants*, and shrink is what keeps
 * a constrained dialog working — on a short window the ledger gives way first, exactly as before, and
 * the card above is never clipped.
 *
 * ## The type scale is legacy's **desktop** one
 *
 * Legacy's sizes are responsive (12/14 → 14/16) and this is its *desktop* presentation, so headings
 * and values are 16/600 (`type-body-strong`) and labels, dates and the parenthetical are 14/400
 * (`type-dense-default`). The identity block is the exception legacy also makes: 14/600 over 12/400,
 * at both widths.
 *
 * ## `--background-elevated` for the card, and it is not interchangeable with Surface
 *
 * The dialog itself is `--background-subtle` (the DS `Dialog`'s own fill). In **dark**, Subtle and
 * `--background-surface` are the *same* `#18181b`, so a Surface card inside this dialog would be
 * invisible in one theme only — the trap `blocked-accounts-view.tsx` documents for Listing. Elevated
 * is `--white` / `#222225`: a real step up in both. It is also what `MenuContent` uses, so every
 * floating thing in this app agrees.
 *
 * ## The two actions keep legacy's hierarchy, which is deliberately lopsided
 *
 * **Cancel is a link inside a sentence** — legacy paints that word `#1677ff`, a *link* blue and not an
 * error red — and **Renew is an outlined button in the brand purple** (see `RENEW_BUTTON`). An earlier pass made
 * Cancel a full-width destructive button, which inverts the emphasis: the screen would be pushing the
 * reader towards ending a subscription. Legacy is right and this follows it; the confirm behind the
 * link is where the weight belongs.
 *
 * ## What still differs from legacy, and it is one thing
 *
 * Legacy renders a **bottom drawer below `md`**; this is a centred dialog at every width. The DS does
 * draw that (`Sheet/Bottom Sheet`, `.tevi-bottom-sheet`) and it is **not ported** — porting it is a
 * `shared/ui` job other screens want too, and DoD §10 forbids hand-rolling an overlay. The DS Dialog
 * is 370 wide with `max-w-[calc(100vw-2rem)]`, so a phone gets a card with 16px either side. When the
 * sheet lands, only the shell around this content changes.
 *
 * ## The identity is a link, which it is not in legacy
 *
 * The row that opens this used to be the link to the creator's space, and it is now the press that
 * opens this — so the space has to be reachable from in here. Legacy's header is inert and its avatar
 * is a `div` with an `onClick`.
 */
/**
 * Renew — legacy's `variant='outlined'` in the theme's purple, which the DS Button has no variant for.
 *
 * Its five are `primary | secondary | ghost | accent | destructive`, and none of them is an *outlined
 * accent*: `accent` is the filled brand purple and `secondary` is the outlined **neutral**. So this is
 * `secondary`'s geometry (the border, the transparent-ish surface, the same height and radius) with the
 * brand's ink — an override at the call site rather than a sixth variant, because the DS does not draw
 * one and inventing one in `shared/ui` would assert a port that never happened.
 *
 * ## `--primary-600`, not `--primary-500`, and that is the readable choice rather than the literal one
 *
 * Legacy's purple is `#501bc0`, which is `--primary-500` — the same hex in both our themes, because
 * that step does not flip. As **ink on a dark card** it measures about 1.5:1 against `#222225`:
 * unreadable, and only in dark mode.
 *
 * `--primary-600` is the position on the ramp that inverts (`#4316a0` light, `#8a4fe3` dark), so it
 * lands near 9:1 and 5.4:1 — past WCAG AA in both. It is also exactly what `ChannelLiveFilter` paints
 * its tick with, so every brand-coloured mark in this app agrees. The Primary ramp inverting between
 * modes is the thing `CLAUDE.md` warns about; this is the case it warns about.
 *
 * The hover is `--primary-100` (`#ede4fd` / `#210b52`) — MUI's outlined hover is a tint of the primary,
 * and that is the DS's own pale step of the same ramp rather than a hand-mixed alpha.
 */
/**
 * The header's **Delete** — a test reset, not a product action (see `membershipApi.remove`).
 *
 * Gated on the *deployment* (`NEXT_PUBLIC_ENV`), not on `NODE_ENV`: the point is that QC on the dev
 * environment can put an account back to "not a member", and a staging or production build — local
 * or not — never offers it. Read at module scope because Next inlines the value at build time.
 */
const CAN_DELETE = env.NEXT_PUBLIC_ENV === 'development'

/** The header's two discs share everything but their edge. */
const HEADER_BUTTON =
    'absolute flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-default disabled:opacity-50'

const RENEW_BUTTON = cn(
    'w-full border-(--primary-600) bg-transparent text-(--primary-600)',
    'hover:not-disabled:bg-(--primary-100)',
)

export function MembershipDetailDialog({
    membership,
    onOpenChange,
}: {
    /** The open membership. `null` closes the dialog and disables its query. */
    membership: Membership | null
    onOpenChange: (open: boolean) => void
}) {
    const { t, currentLanguage } = useTranslation()
    const detail = useMembershipDetail(membership, { onDeleted: () => onOpenChange(false) })

    /**
     * Buying an expired tier again goes through the **join** dialogs, so the reader chooses Star or
     * card there instead of being charged whichever currency this screen picked for them.
     *
     * It is a *snapshot* taken when Renew is pressed, not a read of `membership`, because pressing it
     * closes this dialog — and its `membership` prop is owned by the list, which sets it to `null` on
     * close. Driven straight off the prop, the join dialog would lose its offer in the same frame it
     * opened. The snapshot also survives the row being replaced by a refetch underneath.
     */
    const [renewing, setRenewing] = useState<RenewalOffer | null>(null)
    const renewFlow = useJoinMembership({
        slug: renewing?.slug ?? '',
        channelId: renewing?.channelId ?? null,
        offer: renewing?.offer ?? null,
    })

    const channel = membership?.channel ?? null
    const name = membershipChannelName(channel)
    const slug = channel?.slug ?? ''
    const label = name || (slug ? `@${slug}` : t('my_membership_unknown_creator'))
    const verifiedImage = channel?.verified_tick_badge?.image ?? null

    /**
     * `isEnding` is the shared resolver (`lib/membership-date.ts`) — the row and this dialog used to
     * branch differently and disagree about the same object. `isExpired` stays separate because it
     * decides the *action* (resubscribe vs cancel), not the date's label.
     */
    const isEnding = membership !== null && isMembershipEnding(membership)
    const isCancelled = membership?.canceled_at != null
    const isExpired = membership?.status === 'expired'
    const date = formatMembershipDate(membership?.end_date, currentLanguage)
    const price = membershipPrice(membership?.package_price, membership?.package_price_currency)
    const method = membership?.payment_method
    const methodKey = paymentMethodLabelKey(method)
    const methodLabel = methodKey ? t(methodKey) : prettifyPaymentMethod(method)

    const identity = (
        <>
            <AnimatedAvatar
                size="medium"
                thumb={channel?.images?.thumb}
                avatarVideo={channel?.images?.avatar_video}
                isPremium={channel?.is_premium}
                alt=""
                initials={label.replace('@', '').slice(0, 2).toUpperCase()}
            />
            <span className="flex min-w-0 flex-col items-start">
                <span className="flex min-w-0 items-center gap-1">
                    <span className="type-dense-strong truncate text-(--text-title)">{label}</span>
                    <VerifiedBadge image={verifiedImage} size={16} />
                </span>
                {slug && (
                    // `dir="ltr"`: `@` is bidi-neutral, so `@ada` renders as `ada@` inside an Arabic
                    // paragraph. Same fix, same reason, as `membership-row.tsx`.
                    <span dir="ltr" className="type-caption-meta truncate text-(--text-subtitle)">
                        @{slug}
                    </span>
                )}
            </span>
        </>
    )

    /*
     * The detail card's node, held in state rather than a ref: the dialog is portalled and mounts on
     * open, so an effect has to re-run when the node appears. Same pattern as `channel-description.tsx`.
     */
    const [detailCard, setDetailCard] = useState<HTMLDivElement | null>(null)
    const [detailHeight, setDetailHeight] = useState<number | null>(null)

    useEffect(() => {
        // Closed: forget the measurement, or the next membership's ledger is sized to the last one's
        // card for a frame — and a cancelled membership's card is a line taller than a renewing one's.
        if (!detailCard) {
            setDetailHeight(null)
            return
        }

        /*
         * `offsetHeight`, **not** `getBoundingClientRect()`. The popup animates in from `scale-95`, and
         * a rect is the *painted* box — so a measurement taken during those 200ms comes back 5% short
         * (296 → 281.2, measured), and `ResizeObserver` never corrects it because a transform is not a
         * resize. `offsetHeight` is the layout box and ignores transforms entirely.
         */
        const measure = () => setDetailHeight(detailCard.offsetHeight || null)
        measure()

        /*
         * The height moves with the content (a renew band appears, a name wraps at a narrow width) and
         * with the viewport. Guarded because the API is absent in jsdom, where the measurement is
         * meaningless anyway — the fallback is the pre-existing "whatever is left" behaviour.
         *
         * No feedback loop, and it rests on one fact: the observed card is `flex-none`, so its height
         * is set by its content and the ledger's basis cannot push back on it. Make that card
         * shrinkable and this observer starts driving its own input.
         */
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(detailCard)
        return () => observer.disconnect()
    }, [detailCard])

    return (
        <>
            <Dialog open={membership !== null} onOpenChange={onOpenChange}>
                {/*
                 * `gap-0 p-0` overrides the DS Dialog's inset and gap: the padding belongs to the two
                 * bands (a fixed title row, a scrolling body) rather than to the popup, or the
                 * scrollbar runs inside 24px of dead margin and the title scrolls with the content.
                 */}
                {/*
                 * 800, up from 640, and the number is the pair's arithmetic rather than a taste call:
                 * the two cards are the same height now, so the dialog has to fit **two** of them plus
                 * the 56px title row, 32px of body padding and the 12px between them. The detail card
                 * measures 226–349 across the fixtures (a cancelled membership carries an extra line, an
                 * expired one a renew band), and 2 × 349 + 100 = 798.
                 *
                 * At 640 the ledger was simply the flex item that gave way, so it came out 40–80px
                 * shorter than the card above it on every desktop — the arrangement was capped rather
                 * than balanced.
                 *
                 * `85vh` still wins on a short window, and past it the ledger still shrinks. That is the
                 * right order of sacrifice: the card above has no scroll of its own, so clipping it
                 * would hide the figures the dialog exists to show.
                 */}
                <DialogContent className="max-h-[min(85vh,800px)] gap-0 overflow-hidden p-0">
                    {/*
                     * Legacy's `Title`: dismiss on the leading side, title centred. The glyph is
                     * `xmark` at every width — legacy shows a back chevron on mobile because there it
                     * is a full-height drawer, and this is a card.
                     */}
                    <div className="relative flex h-14 flex-none items-center justify-center border-(--separator-default) border-b px-2">
                        <DialogClose
                            data-testid="membership-detail-close"
                            aria-label={t('common_close')}
                            className={cn(HEADER_BUTTON, 'start-2 text-(--text-title)')}
                        >
                            <Icon name="xmark" size={20} />
                        </DialogClose>
                        <DialogTitle className="truncate">
                            {t('my_membership_detail_title')}
                        </DialogTitle>
                        {/* Dev-only — see `CAN_DELETE`. Trailing, opposite the dismiss. */}
                        {CAN_DELETE && (
                            <button
                                type="button"
                                data-testid="membership-delete"
                                aria-label={t('my_membership_detail_delete')}
                                disabled={detail.isPending || !detail.canRemove}
                                onClick={() => detail.openConfirm('delete')}
                                className={cn(HEADER_BUTTON, 'end-2 text-(--text-error)')}
                            >
                                <Icon name="trash" size={20} />
                            </button>
                        )}
                    </div>

                    {/*
                     * `p-3 gap-3` — one uniform 12px frame, gutter equal to the gap between the two
                     * cards. Legacy's `Stack p=16 gap=12` put 16 here *and* 16 inside each card, so
                     * the ledger's first character sat 32px from the dialog edge — deeper than the DS
                     * dialog's own 24px inset, on the densest screen this feature has. The cards keep
                     * `p-4`: that is the DS card's padding (`shared/ui/card.tsx`) and it is what makes
                     * them read as cards rather than as tinted stripes.
                     *
                     * **No `overflow-y`**: the scroll lives on the history rows, so this column only
                     * has to pass its height constraint down, which is what `min-h-0` does.
                     */}
                    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
                        <div
                            ref={setDetailCard}
                            className="flex flex-none flex-col gap-3 rounded-(--radius-lg) bg-(--background-elevated) p-4"
                        >
                            {/* CardHeader. A link, so the space stays reachable from the list. */}
                            {slug ? (
                                <Link
                                    data-testid="membership-detail-channel-link"
                                    href={toChannelPath(slug)}
                                    className="flex min-w-0 items-center gap-3 rounded-(--radius-lg) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {identity}
                                </Link>
                            ) : (
                                <div className="flex min-w-0 items-center gap-3">{identity}</div>
                            )}

                            {membership?.package?.name && (
                                <>
                                    <span className="type-body-strong text-(--text-title)">
                                        {membership.package.name}
                                    </span>
                                    <Rule />
                                </>
                            )}

                            {/*
                             * The figures. Each row drops itself rather than printing a label with
                             * nothing after it — the same rule the list row follows, and the reason
                             * `price` is `null` rather than `0` when it could not be read.
                             */}
                            <dl className="m-0 flex flex-col gap-3">
                                {price && (
                                    <DetailRow label={t('my_membership_detail_price')}>
                                        <span className="flex items-center gap-1">
                                            <StarMark />
                                            <span className="type-body-strong text-(--text-title)">
                                                {formatStarAmount(price.star, currentLanguage)}
                                            </span>
                                            <span className="type-dense-default text-(--text-subtitle)">
                                                {t('my_membership_price_fiat', {
                                                    amount: formatFiatAmount(
                                                        price.usd,
                                                        DEFAULT_CURRENCY,
                                                        currentLanguage,
                                                    ),
                                                })}
                                            </span>
                                        </span>
                                    </DetailRow>
                                )}
                                {date && (
                                    <DetailRow
                                        label={
                                            isEnding
                                                ? t('my_membership_detail_expiry_date')
                                                : t('my_membership_detail_next_charge')
                                        }
                                    >
                                        <span className="type-body-strong text-(--text-title)">
                                            {date}
                                        </span>
                                    </DetailRow>
                                )}
                                {methodLabel && (
                                    <DetailRow label={t('my_membership_detail_payment_method')}>
                                        <span className="flex items-center gap-1">
                                            {/*
                                             * Legacy puts a 20px mark before the method — a crown for
                                             * `vip_pass`, a star for `star`, a generic card otherwise.
                                             * Its three are raster CDN files in one grey; these are the
                                             * DS sprite at `--icon-secondary`, the role for a mark that
                                             * qualifies a value rather than being the value.
                                             */}
                                            <Icon
                                                name={paymentMethodGlyph(method)}
                                                size={20}
                                                className="flex-none text-(--icon-secondary)"
                                            />
                                            <span className="type-body-strong text-(--text-title)">
                                                {methodLabel}
                                            </span>
                                        </span>
                                    </DetailRow>
                                )}
                            </dl>

                            <Rule />

                            {/*
                             * The action band, **inside the card and inside the scroll** — where legacy
                             * puts it (its `Grid item` is the last child of the same `CardContent`).
                             *
                             * Three shapes, and the asymmetry is legacy's and deliberate:
                             *
                             * - **Active and renewing** → a sentence whose last word is a *link*.
                             *   Cancelling is the discouraged direction, so it gets the lightest
                             *   affordance available; the confirm behind it carries the weight.
                             * - **Active but cancelled** → a sentence and a `secondary` Renew button
                             *   (legacy's `outlined`), which is `undo-cancel/`: free and its own
                             *   inverse, so no confirm.
                             * - **Expired** → the same shape, but Renew is a *purchase*, so it opens
                             *   the **join dialogs** — currency choice, fee line, card handoff and
                             *   confirm, all of it the space page's flow rather than a second copy
                             *   here. Absent when the tier cannot be bought — see `renewalOffer`.
                             */}
                            {isExpired ? (
                                <ActionBand
                                    text={
                                        date
                                            ? t('my_membership_detail_ended_on', { date })
                                            : t('my_membership_detail_ended')
                                    }
                                >
                                    {detail.renewalOffer && (
                                        <Button
                                            data-testid="membership-renew-options"
                                            variant="secondary"
                                            size="large"
                                            className={RENEW_BUTTON}
                                            onClick={() => {
                                                /*
                                                 * Snapshot, then step aside, then open: the join
                                                 * dialogs take this dialog's place rather than
                                                 * stacking on it, so there is one card on screen and
                                                 * closing it returns to the list. Legacy leaves both
                                                 * open and closes this one only after a successful
                                                 * purchase, which leaves a stale expired row behind
                                                 * the success screen.
                                                 */
                                                setRenewing(detail.renewalOffer)
                                                onOpenChange(false)
                                                renewFlow.open()
                                            }}
                                            disabled={detail.isPending}
                                        >
                                            {t('my_membership_detail_renew')}
                                        </Button>
                                    )}
                                </ActionBand>
                            ) : isCancelled ? (
                                <ActionBand
                                    text={
                                        date
                                            ? t('my_membership_detail_valid_until', { date })
                                            : t('my_membership_detail_will_not_renew')
                                    }
                                >
                                    <Button
                                        data-testid="membership-renew"
                                        variant="secondary"
                                        size="large"
                                        className={RENEW_BUTTON}
                                        onClick={detail.renew}
                                        disabled={detail.isPending}
                                    >
                                        {t('my_membership_detail_renew')}
                                    </Button>
                                </ActionBand>
                            ) : (
                                <p className="type-dense-default m-0 text-center text-(--text-subtitle)">
                                    {t('my_membership_detail_cancel_hint')} {/*
                                     * A real `<button>` inside the sentence, not legacy's `Typography
                                     * role="button" tabIndex={0}` — which is focusable but not
                                     * activated by Space and announced without a name. The word takes
                                     * `--text-link`, which is where legacy's `#1677ff` maps.
                                     */}
                                    <button
                                        data-testid="membership-cancel"
                                        type="button"
                                        onClick={() => detail.openConfirm('cancel')}
                                        disabled={detail.isPending}
                                        className="type-dense-default cursor-pointer border-0 bg-transparent p-0 text-(--text-link) underline-offset-2 outline-none hover:underline focus-visible:rounded-(--radius-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {t('my_membership_detail_cancel')}
                                    </button>
                                </p>
                            )}
                        </div>

                        <PaymentHistorySection
                            detail={detail}
                            locale={currentLanguage}
                            matchHeight={detailHeight}
                            title={t('my_membership_detail_payment_history')}
                            emptyLabel={t('my_membership_detail_history_empty')}
                            errorLabel={t('my_membership_detail_history_error')}
                            retryLabel={t('common_retry')}
                            loadingLabel={t('common_loading')}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            {/*
             * The two confirms. Nested inside this component rather than inside the dialog's DOM:
             * base-ui portals both, so each lands above the detail card and dismissing it returns focus
             * to the control that raised it.
             *
             * Separate instances rather than one with swapped copy, because they are not the same
             * question — one stops a charge, the other makes one. `detail.confirm` is a single field,
             * so only one can ever be open.
             */}

            {/* Legacy's wording, kept: "Do you want to cancel your membership?" / "After canceling,
                you can still access your membership until [date]." / "Yes, I want" · "Close". */}
            <ConfirmDialog
                testId="membership-cancel-confirm"
                open={detail.confirm === 'cancel'}
                onOpenChange={open => (open ? detail.openConfirm('cancel') : detail.closeConfirm())}
                destructive
                pending={detail.isPending}
                title={t('my_membership_detail_cancel_confirm_title')}
                description={
                    date
                        ? t('my_membership_detail_cancel_confirm_body', { date })
                        : t('my_membership_detail_cancel_confirm_body_no_date')
                }
                confirmLabel={t('my_membership_detail_cancel_confirm_yes')}
                cancelLabel={t('common_close')}
                onConfirm={detail.cancel}
            />

            {CAN_DELETE && (
                <ConfirmDialog
                    testId="membership-delete-confirm"
                    open={detail.confirm === 'delete'}
                    onOpenChange={open =>
                        open ? detail.openConfirm('delete') : detail.closeConfirm()
                    }
                    destructive
                    pending={detail.isPending}
                    title={t('my_membership_detail_delete_confirm_title')}
                    description={t('my_membership_detail_delete_confirm_body')}
                    confirmLabel={t('common_delete')}
                    cancelLabel={t('common_close')}
                    onConfirm={detail.remove}
                />
            )}

            {/*
             * The purchase, in the join lane's own dialogs. Rendered here rather than by this
             * dialog's caller so both entry points — the list row and the space page's activated
             * button — get it without plumbing, and outside the `Dialog` above so it is a sibling
             * card rather than a nested one.
             *
             * `renewing` keeps them mounted after this dialog has closed; a successful join
             * invalidates `membershipKeys`, so the list behind is already correct when the reader
             * dismisses the success screen.
             */}
            {renewing && (
                <BecomeAMemberDialogs
                    flow={renewFlow}
                    target={{
                        slug: renewing.slug,
                        name: renewing.name,
                        id: renewing.channelId,
                        avatarUrl: renewing.avatarUrl,
                    }}
                />
            )}
        </>
    )
}

/**
 * Legacy's MUI `Divider` inside the card — a 1px rule, full width of the content box.
 *
 * `aria-hidden` and a `<span>`, not an `<hr>`: it separates rows of one table of figures rather than
 * thematic sections, so announcing it as a break adds nothing.
 */
function Rule() {
    return <span aria-hidden="true" className="block h-px w-full bg-(--separator-default)" />
}

/** One label/value line. A `<dl>` row, because that is what a list of named figures is. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3">
            <dt className="type-dense-default text-(--text-subtitle)">{label}</dt>
            <dd className="m-0 min-w-0 text-end">{children}</dd>
        </div>
    )
}

/** A centred sentence with an optional control under it — legacy's `Stack spacing='5px'`. */
function ActionBand({ text, children }: { text: string; children?: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-[5px]">
            <p className="type-dense-default m-0 text-center text-(--text-subtitle)">{text}</p>
            {children}
        </div>
    )
}

/**
 * The mark beside a payment method. Legacy's three, mapped onto the DS sprite.
 *
 * `address-card` is the fallback rather than a card-specific glyph, and it is the one the account
 * drawer's own Card management row uses — so "paid by card" and "manage your cards" are marked the
 * same way. An unknown future method lands here too, which is right: it is a payment instrument this
 * client has no picture for, and a generic instrument is a truer mark than a guessed one.
 */
function paymentMethodGlyph(method: string | null | undefined): TeviIconName {
    switch (method) {
        case 'vip_pass':
            return 'crown'
        case 'star':
            return 'star'
        default:
            return 'address-card'
    }
}

/**
 * Every charge against this membership — legacy's **second Card**: a heading, a rule, then date/amount
 * rows at a 12px gap.
 *
 * ## The amount keeps the currency it was charged in
 *
 * Legacy branches on the row's own `package_price_currency`: `USD` prints `$4.99` plain, anything else
 * prints the Star mark and the count. An earlier pass here ran every row through `membershipPrice`,
 * which converts — so a card charge was displayed as `★499`. That is a *ledger*: it has to say what
 * left the account, not what that would have been worth in the other unit. The card above converts
 * because it is describing one price two ways; a receipt does not get to.
 *
 * A currency this client has no rule for drops the amount rather than guessing at a symbol — the same
 * fail-closed call `membershipPrice` makes, and `normalizePaymentHistories` has already dropped rows
 * with no readable price at all.
 *
 * ## No rules between rows
 *
 * Legacy separates them with the parent Grid's 12px spacing and nothing else. The rule under the
 * heading is the only one, and it belongs to the heading.
 *
 * ## Four states, and the rows are the scroll container
 *
 * `min-h-0 flex-1 overflow-y-auto` on the list, so the heading stays above it — see the file's note.
 * An error here does not take the dialog down: the figures in the card above still answer "what am I
 * paying", so it degrades to a line and a retry.
 *
 * `matchHeight` is the measured height of the card above, applied as a flex **basis** so this card is
 * the same size as its pair and the rows scroll inside it. It is ignored in the three non-row states,
 * and it is `null` until the measurement lands (and in jsdom, which has no layout) — in which case
 * this falls back to `flex-1`, the behaviour it had before. See the file's note.
 */
function PaymentHistorySection({
    detail,
    locale,
    title,
    emptyLabel,
    errorLabel,
    retryLabel,
    loadingLabel,
    matchHeight,
}: {
    detail: ReturnType<typeof useMembershipDetail>
    locale: string
    title: string
    emptyLabel: string
    errorLabel: string
    retryLabel: string
    loadingLabel: string
    /** Height of the detail card, in px. `null` before it is measured. */
    matchHeight: number | null
}) {
    const hasRows = !detail.isHistoryLoading && !detail.isHistoryError && !detail.isHistoryEmpty
    const matched = hasRows && matchHeight !== null

    return (
        <section
            className={cn(
                'flex min-h-0 flex-col gap-3 rounded-(--radius-lg) bg-(--background-elevated) p-4',
                // `grow-0 shrink`: sized by the basis below, but still the part that gives way when the
                // dialog is capped. `flex-1` (basis 0, grow 1) is the fallback and the old behaviour.
                matched ? 'shrink grow-0' : 'flex-1',
            )}
            style={matched ? { flexBasis: `${matchHeight}px` } : undefined}
        >
            <h3 className="type-body-strong m-0 flex-none truncate text-(--text-title)">{title}</h3>
            <Rule />

            {detail.isHistoryLoading ? (
                <div className="flex justify-center py-4">
                    <Loader label={loadingLabel} />
                </div>
            ) : detail.isHistoryError ? (
                <div className="flex items-center justify-between gap-3">
                    <span className="type-dense-default text-(--text-body)">{errorLabel}</span>
                    <Button
                        data-testid="membership-history-retry"
                        variant="secondary"
                        size="small"
                        onClick={detail.refetchHistory}
                    >
                        {retryLabel}
                    </Button>
                </div>
            ) : detail.isHistoryEmpty ? (
                <span className="type-dense-default text-(--text-subtitle)">{emptyLabel}</span>
            ) : (
                <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto">
                    {detail.history.map((entry, index) => (
                        <li
                            // `id` is optional on this payload and the list never reorders, so the
                            // index is a legitimate tiebreak rather than the bug it usually is.
                            key={entry.id || `history-${index}`}
                            className="flex flex-none items-center justify-between gap-2"
                        >
                            <span className="type-dense-default text-(--text-subtitle)">
                                {formatMembershipDate(entry.created_at, locale)}
                            </span>
                            <ChargeAmount
                                amount={entry.package_price}
                                currency={entry.package_price_currency}
                                locale={locale}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

/**
 * One charge, in the unit it was charged in.
 *
 * `TVS` → the Star mark and a count; `USD` → the fiat string, symbol pinned in front (see
 * `formatFiatAmount` for why not `style: 'currency'`). Anything else renders nothing: a figure with no
 * unit on a payment record is worse than a row that only carries its date.
 */
function ChargeAmount({
    amount,
    currency,
    locale,
}: {
    amount: number
    currency: string | null
    locale: string
}) {
    if (currency === 'TVS') {
        return (
            <span className="flex flex-none items-center gap-1">
                {/* 15px is legacy's own size for this mark — the one place it is not 16 or 20. */}
                <StarMark size={15} />
                <span className="type-body-strong text-(--text-title)">
                    {formatStarAmount(amount, locale)}
                </span>
            </span>
        )
    }

    if (currency === 'USD') {
        return (
            <span className="type-body-strong flex-none text-(--text-title)">
                {formatFiatAmount(amount, DEFAULT_CURRENCY, locale)}
            </span>
        )
    }

    return null
}
