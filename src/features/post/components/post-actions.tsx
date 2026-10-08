'use client'

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
import { useOpenAuthorConversation } from '../lib/author-conversation'
import { postActionVisibility, replyCost } from '../lib/post-access'
import { mayReply, replyAudience, replyAudienceNotice } from '../lib/who-can-reply'

/**
 * The row under a post — legacy's six controls, in legacy's two groups.
 *
 * ## What is wired, and what is still drawn inert
 *
 * **React, bookmark, share and comment are live.** React is an optimistic mutation that charges Star
 * first where the channel charges (`usePostReaction`); bookmark confirms then flips
 * (`usePostBookmark`); comment navigates to the post's own page; share is the caller's.
 *
 * **Send message opens a conversation with the post's space** — legacy's `BtnSendMain`
 * (`handleStartConversation(owner_id, channel)`): the floating chat window from `md` up, the
 * conversation page below it, a sign-in prompt for a guest. It arrives through
 * `useOpenAuthorConversation` (`lib/author-conversation.tsx`) because `features/message` imports
 * this feature; where nothing provides it — a webview, the dev harness — the button stays drawn and
 * `disabled`.
 *
 * **Quote is drawn `disabled`**, because its composer does not exist. `use-create-action.ts` sets
 * the rule both follow — a control whose destination is not available is **visibly** not ready,
 * because a button that navigates to a 404 is worse than one that is plainly unavailable and a
 * silently inert one is worse than both.
 *
 * ## Commenting can cost Star, and the charge is **not** made here
 *
 * The press navigates; the Star is taken by the reply form on the page it lands on, which is where
 * legacy takes it too (`handleOpenComment` → `ConfirmPaidComment` → the form). Charging on the way
 * *to* a page the reader might not use would bill them for arriving.
 *
 * It no longer **refuses to navigate** when the reader cannot afford the reply, either. Neither
 * native client gates that press: iOS's `onReplyPressed` opens the composer outright, and Android's
 * `checkToReplyInFullScreen` checks *membership*, never balance. Opening a composer is not
 * spending, and the refusal also withheld the *Who can reply?* rules from a reader who may only
 * have wanted to read them. The top-up offer arrives on submit instead.
 *
 * **Reacting keeps its gate.** That press does spend, and Android checks the balance in exactly
 * that place (`onClickBlink`: `balanceModeTVS >= cost`) before calling `purchaseLikeAction`.
 *
 * A reader the creator has restricted to paying members gets something different again:
 * `onUnlockReplies` — `postIntent`'s fourth branch, which opens the membership page. The post is
 * readable, the replies are not, and there is a way in.
 *
 * ## The Star cost badge was dropped, after checking the other two clients
 *
 * It used to read here that leaving the chip off "makes the surface dishonest". The argument was
 * sound; the conclusion was wrong, because it reasoned from legacy web alone. **iOS and Android
 * have both retired it** — iOS hard-codes `likePIView.isHidden = true` with the real predicate
 * commented out beside it, and Android does the same in the feed card, the media viewer *and* the
 * reply row, with the reason written down: *"Paid-interaction price chips on react/comment actions
 * are retired: the creator tier badge next to the name conveys the cost instead."*
 *
 * The reader is still told, and told later: the reply composer prices its **submit** button
 * (`post_reply_submit_priced`), which is Android's one surviving chip and the moment the Star is
 * actually spent. Badge the commit, not the action. `StarCostChip` and its offsets went with this
 * decision; git has them if the product changes its mind.
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
    const openConversation = useOpenAuthorConversation()
    // Addressed by the space's slug, as the conversation route is; no slug, nowhere to go.
    const authorSlug = post.channel?.slug ?? null
    const sendPress =
        openConversation && authorSlug ? () => openConversation(authorSlug) : undefined

    /**
     * What pressing *Comment* does, in the four cases it has.
     *
     * The order is the interesting part. **Affordability is checked before the route in**: a reader
     * who is allowed to reply but cannot pay for it is offered Star, while a reader who is not
     * allowed to reply at all is offered the membership — and the second must not be shown to the
     * first, because buying a membership would not fix a shortfall.
     *
     * ⚠ **A reader who cannot reply is only offered the paywall when there *is* one.** This used to
     * hand every such press to `onUnlockReplies`, which is `usePostUnlock().press` — and that flow
     * answers `postIntent`, which is `'none'` for a **followers-only** post. So on the audience
     * legacy makes most common, the button was live, focusable, and did nothing at all. Now only
     * the `'unlock'` audience takes that route; the rest navigate to the post, where the *Who can
     * reply?* panel names the rule (`lib/who-can-reply.ts`).
     *
     * No Star gate on either branch: **reading** the replies under a post is not something a guest
     * has to sign in for, and it is not something a reader has to afford. Legacy gates the comment
     * *box*, never the navigation, and both native clients gate neither.
     */
    // `mayReply`, so a reader who already follows a followers-only space is not sent to a paywall
    // or bounced to the detail page — see its note in `lib/who-can-reply.ts`.
    const barred = !mayReply(post)
    const audienceAction = replyAudienceNotice(replyAudience(post))?.action ?? 'none'
    const commentPress = barred && audienceAction === 'unlock' ? onUnlockReplies : onComment

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
                        count={post.reply_count}
                        locale={currentLanguage}
                        onPress={commentPress}
                        testId={subTestId(testId, 'next')}
                    />
                ) : null}
            </div>

            <div className="flex items-center gap-0.5">
                {shows.sendMessage ? (
                    <ActionButton
                        icon="send"
                        label={t('post_action_send')}
                        onPress={sendPress}
                        testId={subTestId(testId, 'submit')}
                    />
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
            </button>
            <span className={COUNT_CLASS} title={formatExactCount(count, locale)}>
                {formatCompactCount(count, locale)}
            </span>
        </span>
    )
}

/**
 * Legacy's own artwork, committed rather than fetched — **exported** because the reply row draws the
 * same star, and a second constant pointing at the same file is how two surfaces end up animating to
 * different frames. `public/` is where an animation this app
 * ships lives (`docs/STATIC_ASSETS.md`), and `LottieAnimation` loads it by URL so the 117 KB is
 * cached as a file instead of inlined into a JS chunk.
 */
export const REACTION_ART = '/lotties/icon-star-reactions.json'

/** The artwork's last frame — its `op`, and legacy's own `goToAndStop(60)`. */
export const REACTED_FRAME = 60

/**
 * The bookmark control.
 *
 * Its state comes from `usePostBookmark` rather than straight off the post, because the flip lands
 * **after** the server confirms — so the prop is the starting value, not the current one.
 *
 * ⚠ **The glyph is the sprite's `bookmark-simple`, and the library draws it slashed.** Both of its
 * weights carry the same diagonal `bell-slash` does (verified against upstream Zappicon v1.2.0, whose
 * `bookmark-simple` has one path where the Tevi export has two), so an unsaved post shows a
 * crossed-out bookmark. Legacy's own path stood in for it until icons were held to the library alone
 * (`/dev/icons`); now this is a **library defect raised with Brand** — the fix is the export, and
 * nothing here changes when it lands. `docs/DESIGN_SYSTEM.md` lists it.
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
            {bookmarked ? (
                <Icon name="bookmark-simple" weight="filled" size={24} />
            ) : (
                <Icon name="bookmark-simple" size={24} />
            )}
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
export const COUNT_CLASS =
    'type-dense-emphasis min-w-[2ch] ps-1 text-start tabular-nums text-(--text-body)'
