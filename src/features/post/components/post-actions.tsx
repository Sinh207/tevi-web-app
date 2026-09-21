'use client'

import { useRequireStars } from '@features/balance'
import { LottieAnimation } from '@shared/components/lottie-animation'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount, formatExactCount } from '@shared/lib/format-count'
import { useWebConfig } from '@shared/lib/remote-config'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName, TeviIconNameFilled } from '@shared/ui/icon-names'
import { useState } from 'react'
import type { Post } from '../api/types'
import { usePostBookmark } from '../hooks/use-post-bookmark'
import { usePostReaction } from '../hooks/use-post-reaction'
import { canReply, postActionVisibility, replyCost } from '../lib/post-access'
import { BookmarkIcon, StarCostGlyph } from './legacy-icons'

/**
 * The row under a post — legacy's six controls, in legacy's two groups.
 *
 * ## What is wired, and what is still drawn inert
 *
 * **React, bookmark, share and comment are live.** React is an optimistic mutation that charges Star
 * first where the channel charges (`usePostReaction`); bookmark confirms then flips
 * (`usePostBookmark`); comment navigates to the post's own page; share is the caller's.
 *
 * **Send message and quote are drawn `disabled`**, because each needs a surface that does not exist:
 * a DM thread and the composer. `use-create-action.ts` sets the rule this follows — a control whose
 * destination is not built is **visibly** not ready, because a button that navigates to a 404 is
 * worse than one that is plainly unavailable and a silently inert one is worse than both.
 *
 * ## Commenting can cost Star, and the charge is **not** made here
 *
 * The chip prices it and the press navigates; the Star is taken by the reply form on the page it
 * lands on, which is where legacy takes it too (`handleOpenComment` → `ConfirmPaidComment` → the
 * form). Charging on the way *to* a page the reader might not use would bill them for arriving.
 * What this row does do is refuse to navigate when the reader cannot afford the reply — the same
 * `useRequireStars` gate reacting uses, so the offer to top up appears here rather than three
 * screens later.
 *
 * A reader the creator has restricted to paying members gets something different again:
 * `onUnlockReplies` — `postIntent`'s fourth branch, which opens the membership page. The post is
 * readable, the replies are not, and there is a way in.
 *
 * ## The Star cost badge is the thing not to drop
 *
 * A channel with paid interaction on charges Star **to react and to comment**, and legacy prints the
 * price as a small blue chip on the corner of each of those two icons. Leaving it off does not make
 * the surface simpler, it makes it dishonest: the reader finds out what a tap costs by being charged
 * for it. It renders only above a cost of 1, which is legacy's own threshold.
 *
 * ## Counts are always drawn, including zero
 *
 * Legacy writes `{reactionCount && …}` and `{commentCount && …}`, so a **`0` is falsy and the
 * figure disappears** — the row then reads as "this control has no number" rather than "nobody has
 * reacted yet", and the two icons sit at different widths depending on whether anyone has. Drawing
 * the zero keeps the row a fixed shape and says the true thing. This is the one place the action
 * row deliberately departs from legacy.
 *
 * ## Counts: compact in the row, exact in the title
 *
 * One formatter for both tallies, through `Intl`. Legacy uses `formatNumberCompact` for reactions
 * and a hand-rolled `"1.2k"` for replies — two magnitudes side by side, and the hand-rolled one is
 * wrong in six of the nine locales. A zero count renders **nothing**, which is legacy's behaviour:
 * `{reactionCount && …}` on a falsy `0`.
 */
export function PostActions({
    post,
    isPremiumReader = false,
    onShare,
    onComment,
    onUnlockReplies,
    testId,
}: {
    post: Post
    /** Premium readers are exempt from paid interaction — `features/premium`'s fact, not the post's. */
    isPremiumReader?: boolean
    onShare?: () => void
    /** Go to the post's own page, where the replies are. Absent when there is nowhere to go. */
    onComment?: () => void
    /** `postIntent`'s fourth branch: the post is open but replying is members-only. */
    onUnlockReplies?: () => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const requireStars = useRequireStars()
    const cost = replyCost(post, { isPremiumReader })
    /**
     * Quote is **off unless the console turns it on**, which is legacy's own gate
     * (`remoteConfig.post.create_post.quote.is_active`, and `BtnQuoteMain` returns `null` when it is
     * false). `flag` in the web-config schema defaults to `false`, so an unreachable Firebase hides
     * the control rather than offering a composer that may not be meant to exist yet — the
     * fail-closed rule `CLAUDE.md` states for flags.
     */
    const quoteEnabled = useWebConfig().post.createPost.quote.isActive
    const shows = postActionVisibility(post, { quoteEnabled })

    /**
     * What pressing *Comment* does, in the three cases it has.
     *
     * The order is the interesting part. **Affordability is checked before the route in**: a reader
     * who is allowed to reply but cannot pay for it is offered Star, while a reader who is not
     * allowed to reply at all is offered the membership — and the second must not be shown to the
     * first, because buying a membership would not fix a shortfall.
     *
     * A cost of `null` means free, and `requireStars(0, …)` is not used there: it would still wrap
     * the press in a sign-in gate, and **reading** the replies under a post is not something a guest
     * has to sign in for. Legacy gates the comment *box*, never the navigation.
     */
    const commentPress = !canReply(post)
        ? onUnlockReplies
        : cost !== null && onComment
          ? requireStars(cost, onComment)
          : onComment

    return (
        <div
            data-testid={subTestId(testId, 'footer')}
            className="flex h-9 items-center justify-between md:h-10"
        >
            <div className="flex items-center gap-2">
                <ReactButton
                    post={post}
                    cost={cost}
                    locale={currentLanguage}
                    testId={subTestId(testId, 'reveal')}
                />
                {shows.comment ? (
                    <ActionButton
                        icon="comment"
                        label={t('post_action_comment')}
                        cost={cost}
                        count={post.reply_count}
                        locale={currentLanguage}
                        onPress={commentPress}
                        testId={subTestId(testId, 'next')}
                    />
                ) : null}
            </div>

            <div className="flex items-center gap-0.5">
                {shows.sendMessage ? (
                    <ActionButton icon="send" label={t('post_action_send')} />
                ) : null}
                {shows.quote ? (
                    <ActionButton icon="arrows-retweet" label={t('post_action_quote')} />
                ) : null}
                {shows.bookmark ? (
                    <BookmarkButton post={post} testId={subTestId(testId, 'item')} />
                ) : null}
                <ActionButton
                    icon="share"
                    label={t('post_action_share')}
                    onPress={onShare}
                    testId={subTestId(testId, 'trigger')}
                />
            </div>
        </div>
    )
}

/**
 * One control: a 32px target with a 24px glyph, and — for the two that carry one — a count beside it
 * and a Star price on its corner. Legacy's geometry throughout.
 *
 * `disabled` when no handler is given, which is what keeps "not built yet" from being expressible
 * as a live-looking button: a caller cannot forget to pass the handler and end up with a control
 * that swallows presses.
 */
function ActionButton({
    icon,
    filledIcon,
    label,
    count,
    cost,
    locale,
    filled = false,
    pressed,
    busy = false,
    className,
    onPress,
    testId,
}: {
    icon: TeviIconName
    /**
     * The pressed-state glyph, and it is a **separate name** rather than a `weight` prop passed
     * through.
     *
     * `Icon`'s props are a discriminated union, so a weight can only be applied to a glyph the
     * sprite actually has at that weight — which is the guard this repo needs here: 65 of the bare
     * ids are `<use>` aliases onto one weighted symbol, and toggling the weight on one of those
     * draws the same thing twice (`sprite-weight-toggle.test.ts`). Naming both states makes an
     * un-toggleable icon a type error instead of a state that silently never changes.
     */
    filledIcon?: TeviIconNameFilled
    label: string
    count?: number
    cost?: number | null
    locale?: string
    filled?: boolean
    /** Published as `aria-pressed` — a toggle's state belongs in ARIA, never in the testid. */
    pressed?: boolean
    busy?: boolean
    className?: string
    onPress?: () => void
    testId?: string
}) {
    return (
        <span className="flex items-center">
            <button
                type="button"
                onClick={onPress}
                disabled={!onPress}
                aria-label={label}
                aria-pressed={pressed}
                aria-busy={busy || undefined}
                title={label}
                data-testid={testId}
                className={cn(
                    'relative flex size-8 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors',
                    onPress ? 'hover:bg-(--background-segment)' : 'cursor-not-allowed opacity-40',
                    className,
                )}
            >
                {filled && filledIcon ? (
                    <Icon name={filledIcon} size={24} weight="filled" />
                ) : (
                    <Icon name={icon} size={24} />
                )}
                {typeof cost === 'number' && cost > 1 ? (
                    <StarCostChip cost={cost} on="action" />
                ) : null}
            </button>
            {typeof count === 'number' && locale ? (
                <span className={COUNT_CLASS} title={formatExactCount(count, locale)}>
                    {formatCompactCount(count, locale)}
                </span>
            ) : null}
        </span>
    )
}

/**
 * The reaction control — legacy's **Lottie star**, at its 40px target rather than the row's 32.
 *
 * ## Why the artwork is an animation and not a glyph
 *
 * One file carries three things: an unpressed star, a pressed star, and the burst between them
 * (`icon_star_reactions.json` — thirteen layers, `Unselect.png` scaling to 0 at frame 18 and
 * `Select` reaching 100 at frame 44). So the resting states are **stills from the same file that
 * animates the transition**, which is the only arrangement in which the two cannot drift apart. A
 * sprite glyph would be a second drawing that merely happens to mean the same thing.
 *
 * It is a **star** rather than a heart because Tevi reacts with one, and a star is also its
 * currency — which is what makes the Star cost chip on the corner legible rather than confusing.
 *
 * ## The three plays, all of them legacy's
 *
 * | | |
 * |---|---|
 * | at rest | `goToAndStop(reacted ? 60 : 0)` — no rAF, no loop |
 * | on press | `playSegments([0, 60])` reacting, `[60, 0]` taking it back |
 * | on failure | the state snaps back, so the segment plays the other way on the next render |
 *
 * `animate` is off for the first paint and on after the reader has pressed, so a feed scrolling
 * into view does not play twenty bursts at once.
 *
 * ## The write is real
 *
 * `usePostReaction` flips optimistically and rolls back on failure, and `useRequireAuth` gates the
 * **press** rather than the row — a guest sees the tally and is asked to sign in only when they try
 * to add to it.
 */
function ReactButton({
    post,
    cost,
    locale,
    testId,
}: {
    post: Post
    cost: number | null
    locale: string
    testId?: string
}) {
    const { t } = useTranslation()
    const { reacted, count, toggle, isPending } = usePostReaction(post, { cost })
    /**
     * Only a press animates. Held in state rather than derived, because the thing that must not
     * animate is the **first** paint — and "has the reader pressed yet" is not something the post
     * can tell us.
     */
    const [pressed, setPressed] = useState(false)

    return (
        <span className="flex items-center">
            <button
                type="button"
                onClick={() => {
                    setPressed(true)
                    toggle()
                }}
                aria-label={t('post_action_react')}
                aria-pressed={reacted}
                aria-busy={isPending || undefined}
                title={t('post_action_react')}
                data-testid={testId}
                className="relative flex size-10 flex-none items-center justify-center rounded-full"
            >
                <LottieAnimation
                    src={REACTION_ART}
                    frame={reacted ? REACTED_FRAME : 0}
                    animate={pressed}
                    className="size-10"
                />
                {cost !== null && cost > 1 ? <StarCostChip cost={cost} on="react" /> : null}
            </button>
            <span className={COUNT_CLASS} title={formatExactCount(count, locale)}>
                {formatCompactCount(count, locale)}
            </span>
        </span>
    )
}

/**
 * Legacy's own artwork, committed rather than fetched — `public/` is where an animation this app
 * ships lives (`docs/STATIC_ASSETS.md`), and `LottieAnimation` loads it by URL so the 117 KB is
 * cached as a file instead of inlined into a JS chunk.
 */
const REACTION_ART = '/lotties/icon-star-reactions.json'

/** The artwork's last frame — its `op`, and legacy's own `goToAndStop(60)`. */
const REACTED_FRAME = 60

/**
 * The bookmark control.
 *
 * Its state comes from `usePostBookmark` rather than straight off the post, because the flip lands
 * **after** the server confirms — so the prop is the starting value, not the current one.
 *
 * The glyph is `BookmarkIcon` and not `<Icon name="bookmark-simple" />`: the sprite's only bookmark
 * is the **slashed** variant under a plain name, so the DS glyph drew a crossed-out bookmark on a
 * post that had never been saved. `legacy-icons.tsx` carries the full finding and the condition for deleting it.
 */
function BookmarkButton({ post, testId }: { post: Post; testId?: string }) {
    const { t } = useTranslation()
    const { bookmarked, toggle, isPending } = usePostBookmark(post)

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={t('post_action_bookmark')}
            aria-pressed={bookmarked}
            aria-busy={isPending || undefined}
            title={t('post_action_bookmark')}
            data-testid={testId}
            className="relative flex size-8 flex-none items-center justify-center rounded-full text-(--icon-secondary) transition-colors hover:bg-(--background-segment)"
        >
            <BookmarkIcon filled={bookmarked} />
        </button>
    )
}

/**
 * The tally beside an icon, and every part of this class list is holding the row still.
 *
 * ## Pressing react must not move the comment button
 *
 * It did. Three things were letting a count change reflow everything after it:
 *
 * - **`tabular-nums`.** Inter's figures are proportional by default, so `1` is narrower than `0`.
 *   Reacting on a post with no reactions went `0 → 1` and the whole right-hand side of the row
 *   stepped left by a fraction of a character. Tabular figures give every digit one width.
 * - **`min-w-[2ch]`.** With tabular figures `1ch` is exactly one digit, so two digits of slack
 *   means a count can go `0 → 1 → 9` — and back — without the row resizing at all. It still grows
 *   at `10`, which is honest: that genuinely needs more room, and it happens once rather than on
 *   every press.
 * - **`text-start`.** The reserved width has to fill from the icon outwards, or the digit drifts
 *   inside its own slot as the slot's content changes.
 *
 * `ps-1` is the gap between glyph and figure, logical so it flips under RTL.
 */
const COUNT_CLASS =
    'type-dense-emphasis min-w-[2ch] ps-1 text-start tabular-nums text-(--text-body)'

/**
 * The Star price on a paid-interaction channel — a 16px chip pinned to the glyph's top corner.
 *
 * ## It is a star **and** a number, not a number
 *
 * Legacy's chip carries a 12px white star before the figure (`icon` on its MUI `Chip`). Without it
 * the chip reads as a notification count — "5 somethings" — rather than as a price, which is the
 * one thing it exists to say. That was the miss here.
 *
 * ## The white hairline is structural, the fill is not legacy's colour
 *
 * The border separates the chip from whatever icon is underneath rather than from the page, which
 * is why it is fixed white at both themes. The fill is `--button-accent-bg`, **not** legacy's
 * `#0061FF`: this app's brand ramp is `--primary-500` (`#501bc0`), so legacy's blue would be the
 * only blue in a purple product — and a raw hex has no dark mode and is barred outright. Same trade
 * as everywhere else in this port: geometry from legacy, palette from the design system.
 *
 * `type-micro-overline` is the DS's only 10px step, which is legacy's size; its weight is medium
 * against legacy's 600, and that is the DS's ramp rather than something to override by hand.
 */
function StarCostChip({ cost, on }: { cost: number; on: 'react' | 'action' }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'type-micro-overline pointer-events-none absolute flex h-4 items-center gap-0.5 rounded-full border border-white bg-(--button-accent-bg) px-1 text-(--button-accent-text)',
                CHIP_OFFSET[on],
            )}
        >
            <StarCostGlyph />
            {cost}
        </span>
    )
}

/**
 * Where the chip sits, and **the two buttons do not agree** — legacy's own numbers.
 *
 * | | target | `top` | `right` |
 * |---|---|---|---|
 * | react | 40px | `-2` | `-4` |
 * | comment | 32px | `-6` | `-10` |
 *
 * The smaller target pushes its chip further out, because the chip is a fixed 16px tall whichever
 * glyph it is pinned to: at 32px it would otherwise sit **on** the icon rather than on its corner.
 * Using the react offsets for both — which is what this did — left the comment chip 6px inside its
 * own button, reading as a badge stuck to the left of the glyph instead of above its corner.
 *
 * Logical `-end-*`, so the corner follows the writing direction.
 */
const CHIP_OFFSET = {
    react: '-top-0.5 -end-1',
    action: '-top-1.5 -end-2.5',
} as const
