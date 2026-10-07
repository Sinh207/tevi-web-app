'use client'

import { useAuth } from '@features/auth'
import { channelBasePath, parseChannelIntent } from '@features/channel/routes'
import { useUrlIntent } from '@shared/hooks/use-url-intent'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useRef, useState } from 'react'
import type { MembershipTarget } from '../../api/types'
import { useJoinFlow } from '../../hooks/join/use-join-flow'
/*
 * The holdings lane's dialog, opened by the join lane's button — one feature, one subject, and the
 * membership on screen is the same object either way. Legacy's channel button imports its own
 * `Details` dialog for exactly this press.
 */
import { MembershipDetailDialog } from '../holdings/membership-detail-dialog'
import { BecomeAMemberDialogs } from './become-a-member-dialogs'

/**
 * The membership control for a space's action row — "Become a member", or the state that says you
 * already are.
 *
 * ## It renders nothing more often than it renders something
 *
 * Three conditions, and none is defensive — **unless the reader is already a member**, which
 * outranks all three: an existing membership is a fact about the account, and it does not stop being
 * true because the tier that created it is no longer on sale in a currency this app can charge.
 *
 * 1. **The space offers no tier.** Most do not. `useChannelPackages` resolves an empty list, which is
 *    a successful answer, not an error.
 * 2. **Every tier is cash-only.** ⚠ The honest edge of what has shipped: `subscribe/` answers a
 *    Stripe `clientSecret` for a `USD` price, and completing that needs `pay-with-card-panel` —
 *    `docs/PAYMENT.md` §8 pass 4, which does not exist yet. `lib/join-offer.ts` is the single place
 *    that decides, so the day it lands this file does not change.
 * 3. **The list failed to load.** Also nothing: an error where a join button would go tells the
 *    reader about our infrastructure rather than about the creator.
 *
 * ## Already a member: one slot, two things it can open
 *
 * Legacy swaps the same control between "Become a Member" and "Activated Membership" — and its
 * activated state is **pressable**: `handleClick` opens `becomeAMember` or `details` off the same
 * button, and `?action=become_a_member` calls that same handler. That is kept, because the state was
 * previously `disabled` and a disabled button is a dead end on the one screen where the reader has
 * something to do: see what they pay, when it renews, and stop or restart the renewal.
 *
 * It opens the **detail dialog** rather than linking to `/my-membership`: that screen is a list of
 * every membership this account holds, so sending a reader there to find the space they are standing
 * on is a worse answer than the dialog about that space. Same dialog the list opens, so the writes
 * (`cancel/`, `undo-cancel/`) have one implementation, and their invalidation of `membershipKeys.mine`
 * is what turns this button back to "Become a member" when a membership actually ends.
 *
 * ⚠ The DS has no **success** variant. Legacy paints `#E5FFEB` on `#008D1F`, i.e. a success-tinted
 * button Figma does not draw — `shared/ui/button.tsx` is deliberately not given a sixth variant to
 * match it, for the reason `channel-viewer-actions.tsx` sets out at length. So this is `secondary`
 * with the DS's own success ramp over it: `--accents-success-bg-active` for the fill,
 * `--accents-success-active` for the label and the tick, `--accents-success-bg-focus` for hover —
 * the *ramp's* own next step, so the press has a hover state instead of flipping back to grey. All
 * of it flips with the theme where legacy's literals could not.
 *
 * The border is `--accents-success-active/30`, not `secondary`'s `--separator-strong` and not
 * transparent: a grey outline around a green fill belongs to neither state, and no outline at all
 * made this the only control in the action row without an edge. The 30% tint is the pairing
 * `shared/ui/toaster.tsx` already uses for a success surface, so the two agree rather than each
 * inventing a green.
 *
 * ## The control, not the flow
 *
 * The composition — tiers, "am I already a member", the write — is `useJoinFlow`, and this file is
 * one trigger over it. A surface that wants the same flow behind a different affordance (a locked
 * post's unlock sheet, a live room's exclusive rail) calls that hook and mounts
 * `<BecomeAMemberDialogs/>` itself rather than reaching for this button.
 *
 * ## The membership deep link is opened here
 *
 * `/@ada/membership` is a route of its own, and legacy's `/@ada/membership/{id}` and
 * `?action=become_a_member` both still resolve to it — `parseChannelIntent` reads every spelling and
 * ignores the tier id, since there is one offer per space for it to select from.
 *
 * `useUrlIntent().consume()` answers `true` exactly once, which is what keeps React's development
 * double-effect and an unstable `open` identity from opening two dialogs. It takes the link back out
 * of the address bar with `history.replaceState` rather than `router.replace`, for the two reasons
 * `use-channel-tab.ts` sets out — a Next navigation would re-run the route's server component, and
 * the back button should mean "leave this space".
 */
export function BecomeAMemberButton({
    target,
    memberCount,
    onJoined,
    className,
}: {
    /** Who is being joined — identity only, assembled by the caller. See `MembershipTarget`. */
    target: MembershipTarget
    /** For the dialog's "N members" line. `null` until the stats microservice answers. */
    memberCount?: number | null
    /**
     * This account has **just become** a member of `target` — see `useJoinedEdge` below. For the
     * page around the button, whose own data (locked posts, the member count) the purchase moved
     * and which this feature cannot reach.
     */
    onJoined?: () => void
    className?: string
}) {
    const { t } = useTranslation()
    const flow = useJoinFlow(target)
    const { offer, isMember, isMemberKnown, membership, canOffer, open } = flow
    const [detailOpen, setDetailOpen] = useState(false)
    useJoinedEdge(isMember, isMemberKnown, onJoined)

    const { intent, consume } = useUrlIntent(parseChannelIntent, channelBasePath)
    /*
     * The link lands on whichever dialog the press would have opened — legacy routes both through one
     * `handleClick`, so a member following an old `/@ada/membership/{id}` URL sees their membership
     * rather than nothing at all.
     */
    const deeplinkTarget = isMember && membership ? 'detail' : canOffer ? 'join' : null

    useEffect(() => {
        // Only once there is something to open — before that, `consume` must not be spent on a beat
        // where the answer would be "nothing happens".
        if (intent !== 'become_a_member' || !deeplinkTarget) return
        if (!consume()) return
        if (deeplinkTarget === 'detail') setDetailOpen(true)
        else open()
    }, [intent, deeplinkTarget, consume, open])

    // A member keeps the control even with nothing on sale — see the note above.
    if (!offer && !isMember) return null

    return (
        <>
            {isMember ? (
                <Button
                    data-testid="membership-view-detail"
                    variant="secondary"
                    size="large"
                    className={cn(
                        'min-w-0 shrink border-(--accents-success-active)/30 bg-(--accents-success-bg-active) text-(--accents-success-active) hover:not-disabled:bg-(--accents-success-bg-focus)',
                        className,
                    )}
                    onClick={() => setDetailOpen(true)}
                >
                    {/* Hidden below `sm` with the join state's glyph, and for the same
                        measurement — this label is the longer of the two, so the state that
                        overflows worst is the one a member sees. The tick is not what carries the
                        meaning here: the label says "Activated membership" and the whole button is
                        painted in the success ramp. */}
                    <Icon name="check-circle" weight="filled" size={20} className="max-sm:hidden" />
                    <span className="truncate">{t('membership_activated')}</span>
                </Button>
            ) : (
                /*
                 * `accent` — legacy's `#501BC0`, which is `--button-accent-bg` → `--primary-500`
                 * → `#501bc0`, the same value in both themes.
                 *
                 * It was `secondary` for a pass, on a "one filled button per row" reading that was
                 * true when **Follow** still sat here filled. Follow has since moved to the
                 * auto-follow bar, so the row is Member + Donate — and legacy paints exactly that
                 * pair as purple + `#F4F4F4`, i.e. the joined-up version of the same rule: one
                 * emphasis, and it belongs to the recurring commitment rather than the one-off tip.
                 */
                <Button
                    data-testid="membership-join"
                    variant="accent"
                    size="large"
                    /*
                     * `min-w-0 shrink` overrides `Button`'s own `shrink-0`, and the label truncates
                     * — the same pair `DonateButton` beside it already carries.
                     *
                     * Hiding the glyph below `sm` bought 28px and the row still overran a 360px
                     * phone by 34: the caller's `flex-1` is `flex: 1 1 0%`, but the base's
                     * `shrink-0` wins on property order, so the button sat at its content width and
                     * pushed the row past the viewport. A horizontal scrollbar on the space page is
                     * the failure this prevents; an ellipsis on the longest locale is what it costs.
                     */
                    className={cn('min-w-0 shrink', className)}
                    onClick={open}
                >
                    {/*
                     * **`crown`, not `premium`** — design's own choice, and the distinction is
                     * worth writing down because the two are one shape apart. `premium` is Tevi
                     * **Premium**'s brand mark: a multi-colour asset (gold hexagon, purple field,
                     * yellow crown) that `shared/components/premium-badge.tsx` owns and links to
                     * `/premium`. It was on this button, advertising the wrong product in two
                     * colours the accent button never asked for. The bare crown is the DS's own
                     * monochrome glyph, so it takes the button's ink and belongs to nothing else.
                     *
                     * The comps' crown has plain points where `crown--filled` gives each one a
                     * ball tip; at 20px they are the same mark, and the sprite is where a glyph
                     * comes from — an inlined path is a shape no `pnpm icons` run can maintain.
                     *
                     * Free of the row's other glyphs, which is the other half of the choice:
                     * Follow is `user-plus`, Donate is `gift-simple`, Message is `send-alt`.
                     *
                     * ⚠ Legacy has **no glyph at all** on this button (`btnBecomeAMember` renders
                     * bare text, and only its activated state carries `CheckCircleRoundedIcon`).
                     * The icon is this app's addition either way; what changed is which one.
                     */}
                    {/*
                     * **Gone below `sm`** (612 here, not Tailwind's 640 — see `globals.css`).
                     * Measured, not guessed: at 360/390/430 the row's three children summed 418px
                     * against a 328/358/398px row, so the page carried a horizontal scrollbar at
                     * every phone width. `Button` is `whitespace-nowrap` **and** `shrink-0`, so
                     * nothing in this row can give — the label cannot wrap, cannot truncate and
                     * cannot compress. The 28px the glyph and its gap occupy is the only slack
                     * there is, and a decoration is the right thing to spend it on: "Become a
                     * member" says the whole thing without it, and in `vi` ("Trở thành thành
                     * viên", 235px) the label needs every pixel.
                     */}
                    <Icon name="crown" weight="filled" size={20} className="max-sm:hidden" />
                    <span className="truncate">{t('membership_join_action')}</span>
                </Button>
            )}
            {/*
             * `null` while closed, which is the dialog's own contract: it disables the payment-history
             * query rather than fetching a ledger nobody opened.
             */}
            <MembershipDetailDialog
                membership={detailOpen ? membership : null}
                onOpenChange={setDetailOpen}
            />
            <BecomeAMemberDialogs flow={flow} target={target} memberCount={memberCount} />
        </>
    )
}

/**
 * Call `onJoined` when the membership answer flips from a known "no" to "yes" for the same account.
 *
 * Read off the **answer**, not off the purchase, because there are two purchases and only one of
 * them finishes here: Star settles inside `useJoinMembership`, while a card settles in
 * `PaymentProvider` — possibly after the dialog has closed — and reaches this feature only as the
 * `useMembershipPaymentSync` refetch. Both end in `useChannelMembership` answering "member", so the
 * edge on that answer covers both without a second signal.
 *
 * Three `false`s are not a "no", and each would fire a refetch for nothing: the beat before the
 * first answer (`isKnown`), a new account's beat before *its* answer (the key moves, so `isKnown`
 * drops), and an account switch onto one that already holds the membership (the account changed).
 */
function useJoinedEdge(isMember: boolean, isKnown: boolean, onJoined: (() => void) | undefined) {
    const { activeId } = useAuth()
    const last = useRef<{ accountId: string | null; isMember: boolean } | null>(null)
    const callback = useRef(onJoined)
    useEffect(() => {
        callback.current = onJoined
    })

    useEffect(() => {
        if (!isKnown) return
        const previous = last.current
        last.current = { accountId: activeId, isMember }
        if (previous?.accountId === activeId && !previous.isMember && isMember) callback.current?.()
    }, [isMember, isKnown, activeId])
}
