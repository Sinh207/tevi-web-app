'use client'

import { useAuth } from '@features/auth'
import { DonateButton } from '@features/donation'
import { BecomeAMemberButton } from '@features/membership'
import { useOpenConversation } from '@features/message'
import {
    hasMiniApp as channelHasMiniApp,
    OpenMiniAppButton,
    useAutoOpenMiniApp,
} from '@features/mini-app'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { Channel } from '../api/types'
import { useChannelActions } from '../hooks/use-channel-actions'

/**
 * The viewer's action row.
 *
 * ## ⚠ This row is **not** in the design system
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`. Every candidate was checked:
 *
 * - `preview/space.html` draws only the *owner* row (Custom profile + Earning report).
 * - `.tevi-card[data-type="space"]` **does not exist** — the only `space` value in the whole
 *   stylesheet is `.tevi-card-user-header[data-type="space"]`.
 * - `banner`'s eight types are marketing (branded, campaign, countdown, gradient…). Using one for an
 *   action row would be a misuse of a component built around a gradient and a promo CTA.
 * - `button-extra` is `Button/Block` (a 55×62 *vertical tile* drawn for a livestream gift rail) and
 *   `Button/Gift` (an 88×108 tile with a price pill). Neither is "Donate" or "Message".
 *
 * So it is composed from the DS `Button`, which is the honest fallback: every variant used below is
 * one Figma actually ships.
 *
 * ## What is missing from the DS, stated plainly
 *
 * Legacy's "already a member" button is `#E5FFEB` on `#008D1F` — a **success-tinted** button. The DS
 * `Button` has `primary | secondary | ghost | accent | destructive` and no such state. That variant
 * needs to come from design; it is not invented here, and `shared/ui/button.tsx` is deliberately not
 * given a `success` variant, because that file must only say what the DS says.
 *
 * ## What is here, and what is still absent
 *
 * **Follow, Donate and Become a member.** Each of the latter two renders itself only when the
 * creator actually offers the thing *and* it can be paid for in Star, so on an ordinary space this
 * row is one full-width Follow exactly as before. The cash half of both is one boundary rather than
 * two omissions — `docs/PAYMENT.md` §8 pass 4 — and each feature's barrel says so.
 *
 * Messages and the mini app are each their own plan, so their buttons are absent rather than
 * present-and-inert — a row of disabled controls tells the reader nothing.
 *
 * ## Legacy's ordering, and the one place this row will need a decision
 *
 * Legacy's row is Member · Donate · MiniApp · Follow · Message, and that order is kept for the three
 * that exist. What legacy also does is **collapse** as the row fills — Donate shrinks to
 * `fit-content` once a membership button is present, Message drops to a 48×48 icon — because five
 * controls do not fit a phone. Three do, at `flex-1` each. The fourth one to land is where that
 * collapsing has to be ported rather than reinvented.
 *
 * ## Follow stays in the row, and legacy does not put it there
 *
 * Legacy's action row carries a Follow button **only for a protected space**; on a public one the
 * action lives in the top bar's overflow menu beside Report and Block. That is kept as a deliberate
 * divergence: burying the primary action of a space page in a kebab is worse for everybody, and the
 * overflow menu does not exist here yet (`channel-top-bar.tsx`). If it is ever ported, this is the
 * decision to re-open rather than to infer.
 */
export function ChannelViewerActions({
    channel,
    memberCount,
}: {
    channel: Channel
    /** For the membership dialog's "N members" line. `null` until the stats microservice answers. */
    memberCount?: number | null
}) {
    /**
     * **Legacy fetches nothing "secondary" for a space you cannot see into**, and that is what
     * decides this row — not each button's own rule.
     *
     * `viewer/hook`'s `isShowSecondaryData` gates the packages and direct-donate requests on
     * `!hasMiniApp && !(isProtectedChannel && !isFollowed)` (plus the walls, which never reach here).
     * With no packages and no donate record, `BtnBecomeAMember` and `BtnDonation` both return
     * `null` — so a protected space you have not been let into shows **Follow and the message
     * button, and nothing else**.
     *
     * Reproducing it by *not rendering* the two components is the same thing one level up, and it
     * keeps the property that matters: their queries never fire, so this client does not ask a
     * space's price list of somebody it will not show the space to.
     *
     * The mini-app half is legacy's too — a space that leads with its app puts that first and drops
     * both. That button now exists (`features/mini-app`), so this row renders the app entry where
     * it used to render nothing at all; the rule below is unchanged.
     *
     * The check is **the feature's own** rather than a second reading of the same two fields, so a
     * space can never hide its membership button for an app the player would then refuse to open —
     * `has_mini_app` has been seen true with an unusable URL.
     */
    const hasMiniApp = channelHasMiniApp(channel)

    /**
     * **A space that *is* a mini app opens it on arrival.** Legacy does the same, from its own
     * channel viewer: `has_mini_app` marks a game or a service, not a profile to browse, so making
     * the reader find a button to reach the thing they navigated to is a step for nothing.
     *
     * It lives **here**, in the row, rather than in `channel-view` — because this component is
     * exactly the set of readers who are offered the app. `channel-view` renders it only when the
     * space's actions are offered at all, so a suspended space, a blocked account, a protected space
     * the reader has not been let into, a sensitive space they have not agreed to see, and the beat
     * before ownership resolves each withhold the auto-open for free, by withholding the row.
     * Re-deriving those five conditions anywhere else would be a second copy of a rule that is
     * already hard to get right.
     *
     * A guest is skipped rather than gated — the hook says why — so nobody is shown a sign-in dialog
     * for navigating to a page. The Open button below is still there to ask them properly.
     */
    useAutoOpenMiniApp(channel)
    const locked = channel.privacy === 'protected' && !channel.is_followed
    const showsSecondary = !hasMiniApp && !locked

    return (
        /*
         * `empty:hidden` — with Follow gone this row can render **nothing at all**, which is the
         * common case: most spaces sell no membership and take no donations. Without it the header
         * kept a 48px gap where two absent buttons used to be.
         */
        <div className="flex min-w-0 items-center gap-2 empty:hidden">
            {/*
             * **Follow, for a protected space only** — legacy's `BtnFollowRequest`, whose rule is
             * exactly `protected && !followed && !suspended && !blocked && !hasMiniApp`.
             *
             * Follow is otherwise not in this row at all: an ordinary space gets the floating
             * auto-follow bar instead. A protected one cannot — that bar is excluded from every wall
             * (it would offer to subscribe to something not on screen), and this is the space where
             * following is not a nicety but *the way in*. The wall's own copy says so: "Tap the
             * 'Follow' button to send a follow request."
             *
             * It lived inside the wall for a while, which put the one control that opens the space
             * below the explanation instead of in the row every other action uses.
             */}
            <FollowRequestButton channel={channel} />
            {/*
             * **The space's app, and when it is here it is the row.** `showsSecondary` is already
             * false whenever this renders, so it never shares the row with Donate or Become a
             * member — legacy's rule, kept in one place above.
             *
             * It renders itself or nothing, from the same rule `hasMiniApp` reads, and it is
             * visible to a guest: the press raises the sign-in dialog rather than the button being
             * hidden, because hiding it tells a visitor the space has no app. Legacy hides it.
             */}
            <OpenMiniAppButton channel={channel} className="flex-1" />
            {/*
             * `flex-1` each, so the two share the row evenly when both render and either one takes
             * the full width alone. Each returns `null` when the creator does not offer the thing —
             * except for a reader who already **holds** a membership, which the join control keeps
             * showing (and keeps pressable) whatever is on sale. Neither leaves a half-row beside a
             * gap.
             *
             * Both take a **target** rather than a channel: the same two flows are opened from a
             * post, a live room and a message, none of which holds a `Channel`. The slug fallback
             * for an unnamed space lives inside each flow, not here.
             */}
            {showsSecondary && (
                <>
                    <BecomeAMemberButton
                        target={{
                            slug: channel.slug,
                            name: channel.name,
                            id: channel.id,
                            avatarUrl: channel.images.thumb,
                        }}
                        memberCount={memberCount}
                        className="flex-1"
                    />
                    <DonateButton
                        target={{
                            id: channel.id,
                            slug: channel.slug,
                            name: channel.name,
                            avatarUrl: channel.images.thumb,
                            shareUrl: channel.shareable_url,
                        }}
                        /*
                         * **Hugs its label**, and stretches when the membership button is not there —
                         * legacy's own rule:
                         * `width: subscriptionPackages.length > 0 ? 'fit-content' : '100%'`.
                         *
                         * Expressed as a **selector** rather than either component learning about the
                         * other. Neither knows whether the other rendered — each decides from its own
                         * query — so asking that in JSX would mean lifting both queries into this row,
                         * or passing a flag down, to answer something the layout already knows.
                         *
                         * ⚠ It was `only:w-full`, and `:only-child` **never matched**: Message sits in
                         * this row too, so Donate was never alone and stayed `w-fit`. A space that
                         * sells no membership showed Donate and Message hugging the leading edge with
                         * two thirds of the row empty. `:first-child` is the honest test, because the
                         * membership button is the **only** thing that can precede Donate —
                         * `showsSecondary` is false whenever the mini-app button renders, and
                         * `FollowRequestButton` renders only when `locked`, which switches
                         * `showsSecondary` off as well.
                         *
                         * `flex-1`, not `w-full`: legacy's `100%` sits in a row that also holds
                         * Messages and only fits because MUI's button shrinks. This one is `shrink-0`
                         * (`shared/ui/button.tsx`), so `w-full` would push the 48px Message button
                         * past the viewport — the row already overflowed a 360px phone once. Filling
                         * the *remaining* space is what legacy's rule meant here.
                         *
                         * Either selector relies on the row's DOM children being exactly the buttons,
                         * which holds because a closed base-ui `Dialog` renders nothing at all —
                         * verified in a browser rather than assumed.
                         */
                        className="w-fit first:flex-1"
                    />
                </>
            )}
            <SendMessageButton slug={channel.slug} />
        </div>
    )
}

/**
 * "Follow" on a **protected** space — legacy's `BtnFollowRequest`.
 *
 * Renders on exactly legacy's condition and nowhere else: protected, not yet followed, and no mini
 * app (a space that leads with its app puts that first and drops this). A suspended or blocked space
 * never reaches here — `showsChannelActions` withholds the whole row.
 *
 * `accent` is legacy's `#501BC0`, which is this app's accent token. Once the request is in it drops
 * to `secondary` and **keeps working**: pressing again withdraws it, which is legacy's own
 * `handleClick` (`isFollowRequested ? unfollowChannel : followChannel`).
 *
 * It shipped disabled for a moment, on the reasoning that an accidental second tap would silently
 * undo the request. That reasoning is wrong on this screen: with a protected space there is no other
 * way to take a request back — no overflow menu, no follow bar, nothing on the wall — so a disabled
 * button turns a mis-tap into a permanent state. A press that can be repeated is recoverable; a
 * control that refuses is not.
 */
function FollowRequestButton({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const { follow, unfollow } = useChannelActions(channel)

    const applies =
        channel.privacy === 'protected' &&
        !channel.is_followed &&
        !(channel.has_mini_app && channel.mini_app_url)
    if (!applies) return null

    const requested = channel.follow_requested
    return (
        <Button
            data-testid="channel-follow"
            variant={requested ? 'secondary' : 'accent'}
            size="large"
            className="flex-1"
            // Withdraw when a request is pending, send one otherwise — legacy's own branch.
            onClick={requested ? unfollow.run : follow.run}
            // Only while a call is in flight. `requested` is a state, not a reason to refuse.
            disabled={follow.isPending || unfollow.isPending}
        >
            <Icon name="user-plus" weight="filled" size={20} />
            {requested ? t('channel_action_requested') : t('channel_action_follow')}
        </Button>
    )
}

/**
 * "Send message" — legacy's `BtnMessages`.
 *
 * Opens the conversation through `features/message`'s `useOpenConversation`: in the floating window
 * from `md` up, on `/@{slug}/messages` below it. The two barrels reference each other — the chat room
 * reads this feature's channel — which is safe for the reason `features/membership` ⇄ this feature
 * is: neither touches the other at module scope, only inside a component or a hook.
 *
 * ## Two shapes, and CSS picks between them
 *
 * Legacy draws a **48×48 icon** when anything else is in the row and a **full-width labelled
 * button** when it is alone — the same question `DonateButton` answers with `:only-child`, for the
 * same reason: no component in this row knows whether its siblings rendered, because each decides
 * from its own query. So the button hugs to a square and stretches when it is the only child, and
 * the label rides along under `group-[&:only-child]` — hidden in the square form, shown in the wide
 * one.
 *
 * **Signed-in only**, which is legacy's `isShow = isAuthenticated && slug`: an anonymous visitor has
 * no inbox to open a conversation from.
 */
function SendMessageButton({ slug }: { slug: string }) {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const openConversation = useOpenConversation()
    if (!isAuthenticated) return null

    return (
        <Button
            data-testid="channel-message"
            variant="secondary"
            size="large"
            className="group/message w-12 flex-none gap-1 only:w-full only:flex-1"
            aria-label={t('channel_action_send_message')}
            onClick={() => openConversation(slug)}
        >
            <Icon name="send-alt" size={20} />
            <span className="hidden group-[&:only-child]/message:inline">
                {t('channel_action_send_message')}
            </span>
        </Button>
    )
}
