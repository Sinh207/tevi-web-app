'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
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
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { type BlockedAccount, listUserName } from '../api/types'
/*
 * Aliased at the import, not renamed at the source: the function is a short localised date
 * and `channel-header.tsx` is entitled to call it what it uses it for. At *this* call site the
 * date being formatted is when the block was created, and `formatJoinedDate(entry.created_at)`
 * reads like a bug.
 */
import { formatJoinedDate as formatShortDate } from '../lib/channel-format'
import { toChannelPath } from '../lib/channel-slug'

/**
 * One blocked account: avatar, identity, and the button that undoes the block.
 *
 * The DS `List/User Item` (2089:2965) with its `__cta` slot filled — the same 80px row the
 * conversation list uses, which is why the exit animation can animate `height` from a literal
 * 80px (see `tevi-row-collapse`).
 *
 * ## Four decisions worth the words
 *
 * **The name is a link, the row is not.** Legacy makes the whole left half a `div` with an
 * `onClick` that pushes `/@slug` — not focusable, not middle-clickable, not announced as
 * anything. Here the identity block is one `<a>` and the Unblock button is a sibling, so
 * there is no nested interactive element and both are reachable by keyboard in the order they
 * are read. A row whose payload carried no slug renders the same block without the anchor
 * rather than a link to `/@`.
 *
 * **The avatar never animates.** `AnimatedAvatar` with `isPremium={false}`, deliberately: a
 * Premium creator's clip looping in a list of people you have blocked is the wrong thing for
 * this screen to spend attention — and a battery — on. Same call the channel page's terminal
 * screens make, for a related reason.
 *
 * **The third line is new.** Legacy shows name and handle; the block's `created_at` gives the
 * row a "Blocked on …" line, which is the one piece of context that makes a list of forgotten
 * decisions actionable. It is also what fills the DS's three-line stack — `ListUserItemPreview`
 * is drawn top-aligned for exactly three lines, so when the payload carries no date the row
 * centres its two instead of leaving 21px of air under them.
 *
 * **The exit is presentation, the removal is not.** This component only paints `exiting`; the
 * cache write behind it is `useBlockedAccounts`'s timer. See that hook for why there is no
 * `animationend` listener.
 */
export function BlockedAccountRow({
    entry,
    rule,
    unblocking,
    busy = false,
    exiting,
    onUnblock,
    /**
     * Milliseconds of entrance delay. The list staggers its first screen and hands later rows
     * `0` — see `BlockedAccountsView`.
     */
    enterDelay = 0,
    locale,
}: {
    entry: BlockedAccount
    rule: boolean
    /** This row's own unblock is in flight. */
    unblocking: boolean
    /**
     * *Some* row's unblock is in flight. The list is single-flight, so while this is true and
     * `unblocking` is not, this row's button cannot act and must not offer to.
     */
    busy?: boolean
    exiting: boolean
    onUnblock: () => void
    enterDelay?: number
    locale: string
}) {
    const { t } = useTranslation()

    const { user } = entry
    const name = listUserName(user)
    const label = name || (user.slug ? `@${user.slug}` : t('blocked_accounts_unknown_user'))
    const blockedOn = formatShortDate(entry.created_at, locale)
    const verifiedImage = user.verified_tick_badge?.image ?? null

    const identity = (
        <>
            <ListUserItemNameRow className="w-full">
                <ListUserItemName premium={user.is_premium}>{label}</ListUserItemName>
                {/* The badge *image* is the fact, and the gate lives in `VerifiedBadge`: the
                    payload object is present (`{}`) on an ordinary unverified account, so there is
                    nothing to draw without art — no sprite fallback. */}
                <VerifiedBadge image={verifiedImage} size="body" />
            </ListUserItemNameRow>
            {user.slug && <ListUserItemHandle>@{user.slug}</ListUserItemHandle>}
        </>
    )

    return (
        /*
         * The animated box is the `<li>`, and the row inside it keeps its 80px — so the
         * content is *clipped* as the gap closes rather than squashed, which is what makes
         * `overflow-hidden` load-bearing rather than tidy.
         *
         * `aria-hidden` while exiting, because the row is on its way out of the document and
         * a screen reader announcing a name that is fading is noise. `pointer-events-none`
         * for the same reason at the other end: the Unblock button is still in the DOM for
         * 320ms and must not be pressable.
         */
        <li
            aria-hidden={exiting || undefined}
            className={cn(
                'overflow-hidden',
                exiting
                    ? 'pointer-events-none animate-[tevi-row-collapse_320ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:hidden motion-reduce:animate-none'
                    : 'animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none',
            )}
            style={!exiting && enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            {/*
             * Two token overrides on the DS row, both forced by dark mode.
             *
             * **Surface, not Listing.** `ListUserItem` paints `--background-listing` on itself,
             * which is `--black` in Dark — identical to `--background` — so a row left alone
             * repaints the page colour straight back over the card it sits in. The panel's own
             * note has the full reasoning; the row has to agree with it or the card is a
             * surface with black stripes across it.
             *
             * **Segment, not Subtle, for hover.** `--background-subtle` is `--zinc-100`, and so
             * is `--background-surface` in Dark — the same `#18181b`, so hovering a row would do
             * precisely nothing. `--background-segment` (`#edeeef` / `#1e1e20`) is the one step
             * off a surface the DS provides, and it is the pair `page-back-bar.tsx` already uses
             * for a control sitting on one.
             */}
            <ListUserItem className="bg-(--background-surface) transition-colors hover:bg-(--background-segment)">
                {/*
                 * `items-center` when the row is a two-line one, matching the text column beside it.
                 *
                 * The DS slot is `items-start`, and that is right where it comes from: a
                 * conversation row is a name, a message preview and a timestamp, so the avatar
                 * belongs at the top of a block that can grow. This row has **two short lines** and
                 * centres them (`ListUserItemPreview` below), so a top-aligned avatar sat visibly
                 * higher than the name it belongs to — with the row's own padding left over
                 * underneath it.
                 *
                 * Tied to the same condition as the text: with a "blocked on" date the row grows a
                 * third line and the DS's top alignment is correct again.
                 */}
                <ListUserItemAvatar className={blockedOn ? undefined : 'items-center'}>
                    <AnimatedAvatar
                        size="large"
                        thumb={user.avatar.thumb}
                        avatarVideo={user.avatar.avatar_video}
                        isPremium={false}
                        /*
                         * Decorative. It sits in its own column *outside* the link — the anchor
                         * wraps the name and handle only — so it is a picture of somebody whose
                         * name is already announced two elements later. An `alt` here would have
                         * a screen reader read the same person twice per row.
                         */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </ListUserItemAvatar>

                <ListUserItemContent>
                    {rule && <ListRowRule />}
                    <ListUserItemPreview className={blockedOn ? undefined : 'items-center'}>
                        <ListUserItemInfo>
                            {user.slug ? (
                                <Link
                                    data-testid="channel-blocked-row-link"
                                    data-channel-slug={user.slug}
                                    href={toChannelPath(user.slug)}
                                    className="flex w-full min-w-0 flex-col items-start rounded-(--radius-sm) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {identity}
                                </Link>
                            ) : (
                                identity
                            )}
                            {blockedOn && (
                                <ListUserItemMeta>
                                    {t('blocked_accounts_blocked_on', { date: blockedOn })}
                                </ListUserItemMeta>
                            )}
                        </ListUserItemInfo>

                        <ListUserItemCta className="self-center">
                            <Button
                                data-testid="channel-unblock"
                                variant="ghost"
                                size="medium"
                                /*
                                 * Two kinds of unavailable, and they must not be the same
                                 * attribute — the distinction `privacy-security-screen.tsx`
                                 * draws for its switches, and it matters more here.
                                 *
                                 * `aria-disabled` while **this** row's request is running,
                                 * never `disabled`: this is the button the reader just
                                 * pressed, so it is the focused element, and `disabled`
                                 * blurs it — a keyboard user is dropped to the top of the
                                 * document by their own successful press. The soft form
                                 * keeps focus where it is; `unblock()` in the hook is what
                                 * actually refuses the second press.
                                 *
                                 * `disabled` on every **other** row while the list is busy.
                                 * Nothing is mid-interaction there, so taking those out of
                                 * the tab order is the honest answer — and the alternative
                                 * is a button that swallows the press and says nothing,
                                 * because the list is single-flight.
                                 */
                                disabled={busy && !unblocking}
                                aria-disabled={unblocking || undefined}
                                onClick={onUnblock}
                                /*
                                 * The visible label is one word, so it is the same word on
                                 * every row — `aria-label` is what tells a screen reader
                                 * *whose* block this button lifts. Without it, a list of
                                 * twenty rows is twenty buttons called "Unblock".
                                 */
                                aria-label={t('blocked_accounts_unblock_name', { name: label })}
                                /*
                                 * Legacy's `variant='text'` in the brand purple (`#501BC0`),
                                 * which the DS Button has no variant for: `ghost` is the
                                 * boxless one — transparent surface, no border, hover tint —
                                 * and the purple is an override at the call site, the same
                                 * shape `MembershipDetailDialog`'s Renew button takes rather
                                 * than a sixth variant `shared/ui` never ported.
                                 *
                                 * `--primary-600`, not legacy's literal `--primary-500`: 500
                                 * is `#501bc0` in *both* themes, so as ink on the dark row it
                                 * is unreadable. 600 is the step that inverts (`#4316a0` /
                                 * `#8a4fe3`) and clears AA in both — see that dialog for the
                                 * measurements. Hover is `--primary-100`, the ramp's own pale
                                 * step, in place of `ghost`'s neutral zinc.
                                 *
                                 * `-mx-2` against `px-2`: with no box to see, the label — not
                                 * the hit area — is what has to line up with the row's own
                                 * `pe-4`. The padding stays as tap target and reaches the
                                 * edge; the text sits at 16px like every other row edge.
                                 *
                                 * `aria-disabled` is an attribute, not a state the DS Button
                                 * paints — its variant classes key off `:disabled`. So the
                                 * soft form has to repeat the same tokens, including over the
                                 * hover rule, or a button that cannot be pressed still lights
                                 * up under the cursor.
                                 */
                                className={cn(
                                    '-mx-2 px-2 text-(--primary-600) hover:not-disabled:bg-(--primary-100)',
                                    'aria-disabled:cursor-not-allowed aria-disabled:text-(--text-disabled) aria-disabled:hover:bg-transparent',
                                )}
                            >
                                {/* The label stays put and the loader takes the leading slot,
                                    so the button does not change width mid-request and shove
                                    the row's text. */}
                                {unblocking && <Loader className="size-[18px]" />}
                                {t('blocked_accounts_unblock')}
                            </Button>
                        </ListUserItemCta>
                    </ListUserItemPreview>
                </ListUserItemContent>
            </ListUserItem>
        </li>
    )
}
