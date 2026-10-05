'use client'

import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_IN, GIFT_OUT, GIFT_OUT_MS, RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import type { Channel } from '../api/types'
import { useAutoFollow } from '../hooks/use-auto-follow'
import { CHANNEL_CONTAINER } from '../lib/container'

/**
 * The follow prompt — legacy's `components/autoFollowChannel`, and **the only place a space is
 * followed from** now that the action row's button is gone.
 *
 * ## Why a floating bar and not a button in the row
 *
 * Because following is not a thing most readers arrive intending to do. Legacy's row button sits
 * there from the first paint, competing with the two controls that *are* transactions (membership,
 * donation), and it asks before the reader has seen anything. This asks after ten seconds of
 * actually looking at the page, which is also exactly what the account setting promises — and for a
 * reader who has switched that setting on it does not ask at all, it just acts and says so.
 *
 * ## The three ways it ends, and none of them is "ignore it"
 *
 * **Follow** does it now. **Skip** stops the clock and leaves the offer standing — legacy collapses
 * only the Skip button away, which is the right reading: skipping declines the *automatic* action,
 * not the space. And the clock itself follows at zero, for an account that asked for that.
 *
 * The bar disappears the moment the space is followed, whichever of the three did it, because there
 * is nothing left to offer. ⚠ There is also then **no way to unfollow from this page** — legacy puts
 * Follow/Unfollow in the channel bar's overflow menu (`viewer/topBar/iconBtnMore`), which this app
 * has not ported. That gap is real and is not this component's to close; it is noted on
 * `channel-top-bar.tsx` beside the rest of that menu.
 *
 * ## The paint is legacy's, and an earlier pass got this backwards
 *
 * This was first built as a light **surface card**, on the reasoning that `#00000080` and white text
 * "cannot survive dark mode". That reasoning is wrong for this kind of surface, and the design
 * system says so itself: `shared/ui/app-bar.tsx`'s `overlay` theme pins its colours to **Dark in both
 * themes** — `#1d1d1dd9`, `#ffffff33`, white glyph and label — because Figma draws on-media chrome
 * that way. An overlay is not a card; it does not belong to the page's theme.
 *
 * So the bar is legacy's, token for token, and every value turned out to already exist:
 *
 * | legacy | here | |
 * |---|---|---|
 * | `#00000080` | `--opacity-black-50` | the same value, and it is defined once so it does not flip |
 * | `blur(16px)` | `--blur-sm` | 16px exactly (`--blur-md` is 24 — the first pass used the wrong one) |
 * | `borderRadius: 16` | `--radius-xl` | 16px exactly |
 * | Follow `#501BC0` | `variant="accent"` | `--primary-500` **is** `#501bc0`, in both themes |
 * | `theme.shadows[1]` | `shadow-sm` | MUI's second-lightest; the first pass used `shadow-lg` |
 *
 * ## `className="dark"` pins the subtree — and on its own it only pins **half** of it
 *
 * `globals.css` declares the dark block as `.dark, :root[data-theme='dark']`, and the class half
 * matches any element, so the region gets Dark's `--zinc-*` and `--text-title`. That much works, and
 * on a page that is already dark it is a no-op.
 *
 * ⚠ **What it does not do is re-derive the tokens built out of those.** A custom property inherits
 * its *computed* value, and `--button-secondary-bg: var(--zinc-100)` is declared **once**, at
 * `:root` — so the substitution already happened up there, against Light's ramp. Redefining
 * `--zinc-100` further down cannot reach back into it. Measured, not reasoned about: the label went
 * white and the Skip chip stayed `#f4f4f5`, i.e. a near-white button on a black bar in Light and a
 * correct dark one in Dark, which is the worst of both.
 *
 * So the four `--button-secondary-*` the chip actually uses are **re-declared here**, in terms of the
 * ramp rather than as literals: declared *inside* the dark scope, `var(--zinc-100)` finally resolves
 * to Dark's. This is the same move `shared/ui/app-bar.tsx` makes for its `overlay` theme, which sets
 * `--background-topbar-action` and friends on the element for exactly this reason.
 *
 * The rule to take away: **a locally-dark region only flips the tokens the dark block itself
 * re-declares.** Anything defined once at `:root` in terms of the ramp has to be re-declared where
 * the region is.
 *
 * The one thing that could not be matched is the buttons' **32px height and pill radius**: the DS
 * ships 28 / 36 / 48 at radius 12 and nothing at 32. `size="small"` is the nearest, and inventing a
 * fourth size to save four pixels is the thing `CLAUDE.md` forbids.
 *
 * ## Where it sits
 *
 * `fixed` at the bottom of the **channel column**, not the window, so it lines up with the page on a
 * desktop instead of stretching across it. No tab-bar offset is needed and that is load-bearing
 * rather than lucky: this renders for **viewers only**, and `isTabDestination` shows the tab bar on
 * `/`, `/my-space` and *your own* channel — never on somebody else's. The safe-area inset is still
 * honoured, because a phone's home indicator does not care whose page it is.
 */
/** How long the bar takes to leave once the space is followed — see `gone`. */
const LEAVE_MS = 260

export function ChannelAutoFollow({
    channel,
    placement = 'page',
}: {
    channel: Channel
    /**
     * Where the bar is pinned.
     *
     * `page` — the viewport's foot, the space page's own arrangement. `stage` — the Live studio,
     * which legacy mounts the same component into with `sx={{ bottom: '100px', left: '0' }}`: a
     * 600px bar at the stage's leading edge, **100px up**, so it clears the 95px gift tray. It is
     * positioned by its caller there (the studio is a `fixed` overlay at `z-40`, and this bar's
     * page placement is `z-30` — it would sit underneath it and never be seen).
     */
    placement?: 'page' | 'stage'
}) {
    const { t } = useTranslation()
    const { remaining, isCountingDown, skipped, isPending, skip, followNow } =
        useAutoFollow(channel)

    /*
     * **Out, not gone.** Following (any of the three paths) flips `is_followed`, and the bar used
     * to vanish in that frame. Now it slides down and fades for `LEAVE_MS` first, then unmounts.
     * A space already followed on arrival is `gone` from the first render — nothing to animate
     * out of what was never shown.
     */
    const isStage = placement === 'stage'
    const followed = Boolean(channel.is_followed)
    const [gone, setGone] = useState(followed)
    // On the stage the exit is the gift banner's, so it is timed to that animation.
    const leaveMs = isStage ? GIFT_OUT_MS : LEAVE_MS
    useEffect(() => {
        if (!followed) {
            setGone(false)
            return
        }
        const timer = setTimeout(() => setGone(true), leaveMs)
        return () => clearTimeout(timer)
    }, [followed, leaveMs])

    if (gone) return null
    if (isStage) {
        return (
            <StageAutoFollow
                channel={channel}
                followed={followed}
                remaining={remaining}
                isCountingDown={isCountingDown}
                skipped={skipped}
                isPending={isPending}
                skip={skip}
                followNow={followNow}
            />
        )
    }

    return (
        <div
            className={cn(
                CHANNEL_CONTAINER,
                'fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))]',
                // In: the app's entrance, on mount.
                RISE,
            )}
        >
            {/*
             * `<section>` with a name — which *is* a region, natively. This appears without being
             * asked for, so a screen-reader user needs to be able to find it deliberately rather
             * than only by tabbing into it, and a named section is what the rotor lists.
             */}
            <section
                aria-label={t('channel_auto_follow_region')}
                className={cn(
                    'dark flex min-w-0 items-center justify-between',
                    /*
                     * Out: a transition on this inner box rather than another animation on the
                     * outer one — `RISE` holds `translate` once it has played, so a second motion
                     * on the same element would be overridden by it.
                     */
                    'transition-[opacity,translate] duration-[260ms] ease-in motion-reduce:transition-none',
                    followed && 'pointer-events-none translate-y-2 opacity-0',
                    'gap-3 rounded-[var(--radius-xl)] bg-(--opacity-black-50) p-4 shadow-sm backdrop-blur-[var(--blur-sm)]',
                    // See the note above: these four are declared once at `:root` against Light's
                    // ramp, so the local dark scope cannot reach them without a re-declaration.
                    '[--button-secondary-bg:var(--zinc-100)] [--button-secondary-bg-hover:var(--zinc-200)]',
                    '[--button-secondary-text:var(--text-title)] [--button-secondary-border:var(--separator-strong)]',
                )}
            >
                <p className="type-dense-default min-w-0 text-(--text-title)">
                    {t('channel_auto_follow_prompt')}
                </p>

                <div className="flex flex-none items-center gap-2">
                    {/*
                     * Skip goes away once pressed and the offer stays — legacy collapses it
                     * horizontally for the same reason. Rendered conditionally rather than
                     * animated: the DS ships no collapse, and a width transition on a button is
                     * geometry this file would be inventing.
                     */}
                    {!skipped && (
                        <Button
                            data-testid="channel-auto-follow-skip"
                            // The page bar and the stage pill are one control drawn twice; QC tells
                            // them apart by placement.
                            data-option-value="page"
                            variant="secondary"
                            size="small"
                            disabled={isPending}
                            onClick={skip}
                        >
                            {t('channel_auto_follow_skip')}
                        </Button>
                    )}
                    <Button
                        data-testid="channel-auto-follow-now"
                        data-option-value="page"
                        variant="accent"
                        size="small"
                        disabled={isPending}
                        onClick={followNow}
                    >
                        <Icon name="user-plus" weight="filled" size={16} />
                        {t('channel_action_follow')}
                        {/*
                         * `aria-hidden`, deliberately. Inside the button it would change the
                         * control's accessible name every second, so a screen reader would
                         * re-announce "Follow 9 seconds… Follow 8 seconds…" over whatever the
                         * reader was actually listening to. The countdown is a visual affordance;
                         * what a non-visual reader needs is the Skip button, which is right there.
                         */}
                        {isCountingDown && (
                            <span aria-hidden className="type-caption-meta opacity-80 tabular-nums">
                                ({remaining}s)
                            </span>
                        )}
                    </Button>
                </div>
            </section>
        </div>
    )
}

/**
 * **The stage's follow prompt — drawn and moving like a gift banner.**
 *
 * Legacy mounts the page's own 600px bar over the stream. Here it borrows the vocabulary of the
 * other thing that flies in over a live picture, the gift banner (`event-gift-float.tsx`): a 48px
 * pill with the space's face at its leading edge, its name (and tick) over the one-line ask, on a
 * dark glass that fades toward the trailing end — and the banner's own motion, `GIFT_IN` thrown in
 * from the leading edge on arrival and `GIFT_OUT` back toward it once the space is followed. Two
 * things that arrive over the stream now arrive the same way.
 *
 * The motion travels along `--gift-dir`, flipped in RTL, for the reason `tevi-gift-in` gives.
 */
function StageAutoFollow({
    channel,
    followed,
    remaining,
    isCountingDown,
    skipped,
    isPending,
    skip,
    followNow,
}: {
    channel: Channel
    followed: boolean
    remaining: number
    isCountingDown: boolean
    skipped: boolean
    isPending: boolean
    skip: () => void
    followNow: () => void
}) {
    const { t } = useTranslation()
    const [entered, setEntered] = useState(false)
    const name = channel.name ?? channel.slug
    const thumb = channel.images?.thumb ?? null
    const tick = channel.verified_tick_badge?.image ?? null

    return (
        <div
            onAnimationEnd={e => {
                if (e.target === e.currentTarget) setEntered(true)
            }}
            className={cn(
                'absolute start-3 bottom-[100px] z-20 w-fit max-w-[calc(100%-24px)]',
                '[--gift-dir:1] rtl:[--gift-dir:-1]',
                followed ? cn(GIFT_OUT, 'pointer-events-none') : !entered && GIFT_IN,
            )}
        >
            <section
                aria-label={t('channel_auto_follow_region')}
                className={cn(
                    'dark flex h-12 min-w-0 items-center gap-2.5 rounded-full ps-1 pe-1.5',
                    'bg-linear-to-r from-black/75 via-black/60 to-black/45 rtl:bg-linear-to-l',
                    'shadow-lg ring-1 ring-inset ring-white/10 backdrop-blur-[var(--blur-sm)]',
                )}
            >
                <Avatar
                    size="small"
                    type={thumb ? 'image' : 'initials'}
                    className="size-10 flex-none shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-2 ring-white/80"
                >
                    {thumb ? (
                        <Image
                            src={thumb}
                            alt=""
                            width={40}
                            height={40}
                            className="size-full rounded-full object-cover"
                        />
                    ) : (
                        <AvatarInitials>
                            {name.replace('@', '').slice(0, 2).toUpperCase()}
                        </AvatarInitials>
                    )}
                </Avatar>

                <div className="flex min-w-0 flex-col justify-center pe-1">
                    <p className="flex min-w-0 items-center gap-1">
                        <span className="type-dense-strong truncate text-white">{name}</span>
                        {tick && <VerifiedBadge image={tick} size={14} />}
                    </p>
                    <p className="type-caption-meta truncate text-white/75">
                        {t('channel_auto_follow_prompt')}
                    </p>
                </div>

                <div className="flex flex-none items-center gap-1">
                    {/* Skip goes away once pressed and the offer stays — see the page bar. */}
                    {!skipped && (
                        <button
                            type="button"
                            data-testid="channel-auto-follow-skip"
                            // The page bar and the stage pill are one control drawn twice; QC tells
                            // them apart by placement.
                            data-option-value="stage"
                            disabled={isPending}
                            onClick={skip}
                            className={cn(
                                'type-caption-label-strong h-8 rounded-full px-3 text-white/70',
                                'transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50',
                                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                            )}
                        >
                            {t('channel_auto_follow_skip')}
                        </button>
                    )}
                    <Button
                        data-testid="channel-auto-follow-now"
                        data-option-value="stage"
                        variant="accent"
                        size="small"
                        disabled={isPending}
                        onClick={followNow}
                        className="rounded-full"
                    >
                        <Icon name="user-plus" weight="filled" size={16} />
                        {t('channel_action_follow')}
                        {/* `aria-hidden` for the reason the page bar gives. */}
                        {isCountingDown && (
                            <span aria-hidden className="type-caption-meta opacity-80 tabular-nums">
                                ({remaining}s)
                            </span>
                        )}
                    </Button>
                </div>
            </section>
        </div>
    )
}
