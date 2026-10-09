'use client'

import { Menu } from '@base-ui/react/menu'
import { Tooltip, TooltipProvider } from '@shared/components/tooltip'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { buttonVariants } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useRef, useState } from 'react'
import { type FollowedChannel, isFollowedChannelMuted } from '../api/types'
import {
    MENU_ITEM,
    MENU_ITEM_ACTION,
    MENU_ITEM_DESTRUCTIVE,
    MENU_POPUP,
    MENU_TRIGGER,
} from './channel-menu'

/**
 * A followed space's three actions — legacy's kebab on the `/following` row.
 *
 * Pin / Unpin, Mute / Unmute, Unfollow. All three always present, unlike
 * `ChannelEventMenu`'s conditional Cancel: every one of them is meaningful for every row, and each
 * is its own opposite, so the menu never has a dead item.
 *
 * ## Unfollow is painted destructive; the other two are not
 *
 * Not because it deletes anything of the reader's, but because it is the only one that **changes
 * what they see**: the space leaves the list and its posts leave their feed. Pin and mute are
 * preferences on a follow that survives them. Legacy paints all three identically and the
 * consequence is a menu where the item that removes a space looks exactly like the one that
 * silences it.
 *
 * ## No confirmation, because there is an Undo
 *
 * The other destructive presses in this feature go through `ConfirmDialog` (blocking, cancelling an
 * event, Decline all) and this one does not — deliberately. `useFollowedChannels` holds the unfollow
 * for five seconds and offers to cancel it, so the reversal is *after* the press rather than a
 * question before it. A dialog on top of that would be two gates on one action, and the undo is the
 * better of the two: it costs nothing when the press was intended, which is almost always.
 *
 ## A trailing glyph on every row, the same pairs `ChannelViewerMenu` draws
 *
 * Legacy draws an outlined mark per row (`iconPinOutlined` / `iconUnpinOutlined`,
 * `iconMuteOutlined` / `iconUnmuteOutlined`, `iconUnfollowOutlined`). This menu shipped with labels
 * only for a while, because the sprite had no `thumbtack-slash` and nothing for "stop following" —
 * and a column with a mark on one row of three is worse than none. The 2026-10-08 library import
 * closed both gaps, so every row has its pair again:
 *
 * - **Pin / Unpin** — `thumbtack` / `thumbtack-slash`, at `regular` (legacy's are outlines; the bare
 *   `thumbtack` is the solid one). Legacy's pin is slanted and the DS slash pair is upright; the
 *   pair has to agree with itself before it agrees with legacy.
 * - **Mute / Unmute** — `bell-slash` / `bell`: the state the row moves to, as in
 *   `ChannelViewerMenu`.
 * - **Unfollow** — `heart-slash`, which is legacy's own drawing here, and the space menu's Unfollow.
 *
 * Each glyph is a literal tag, not a name in the table: the sprite subset is found by scanning
 * source, and a name handed to `<Icon>` at runtime ships without the weight it is drawn in.
 */
export function FollowingRowMenu({
    channel,
    disabled = false,
    onTogglePin,
    onToggleMute,
    onUnfollow,
}: {
    channel: FollowedChannel
    /** Some write on this list is in flight — the list is single-flight. */
    disabled?: boolean
    onTogglePin: () => void
    onToggleMute: () => void
    onUnfollow: () => void
}) {
    const { t } = useTranslation()
    const muted = isFollowedChannelMuted(channel)
    const name = channel.name || `@${channel.slug}`

    const items: {
        key: string
        label: string
        glyph: React.ReactNode
        tone: 'action' | 'destructive'
        run: () => void
    }[] = [
        {
            key: 'pin',
            label: t(channel.pin ? 'following_unpin' : 'following_pin'),
            glyph: <PinGlyph pinned={channel.pin} size={24} />,
            tone: 'action',
            run: onTogglePin,
        },
        {
            key: 'mute',
            label: t(muted ? 'following_unmute' : 'following_mute'),
            glyph: <MuteGlyph muted={muted} size={24} />,
            tone: 'action',
            run: onToggleMute,
        },
        {
            key: 'unfollow',
            label: t('following_unfollow'),
            glyph: <Icon name="heart-slash" size={24} className="flex-none" />,
            tone: 'destructive',
            run: onUnfollow,
        },
    ]

    return (
        <Menu.Root>
            <Menu.Trigger
                /*
                 * The visible trigger is three dots on every row, so the accessible name has to
                 * carry *whose* row it is — a list of twenty is otherwise twenty buttons called
                 * "More". Same rule `FollowRequestRow` applies to its two buttons.
                 */
                aria-label={t('following_row_actions', { name })}
                disabled={disabled}
                className={cn(
                    MENU_TRIGGER,
                    'disabled:pointer-events-none disabled:opacity-50',
                    // Desktop with a real pointer gets `FollowingRowActions` instead.
                    'md:pointer-fine:hidden',
                )}
            >
                <Icon name="more-horizontal" size={20} className="size-5" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
                    {/* 200, the action-menu width — `channel-menu.tsx` records why the filter's
                        160 and this are two different numbers. */}
                    <Menu.Popup className={cn('min-w-[200px]', MENU_POPUP)}>
                        {items.map(item => (
                            <Menu.Item
                                data-testid="channel-following-menu-item"
                                data-row-key={item.key}
                                key={item.key}
                                className={cn(
                                    MENU_ITEM,
                                    item.tone === 'destructive'
                                        ? MENU_ITEM_DESTRUCTIVE
                                        : MENU_ITEM_ACTION,
                                )}
                                onClick={item.run}
                            >
                                {item.label}
                                {item.glyph}
                            </Menu.Item>
                        ))}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    )
}

/**
 * The pin pair, drawn once for the menu and the hover toolbar. Literal tags inside, not a name
 * passed through — see the note on `FollowingRowMenu` about the sprite scan.
 *
 * The size picks the surface, and the surface picks the weight: **24 is the menu**, outlined like
 * legacy's per-row marks; **20 is the toolbar**, filled, because a bare glyph on the row with no
 * label beside it needs the mass an outline does not have at 20px.
 */
function PinGlyph({ pinned, size }: { pinned: boolean; size: 20 | 24 }) {
    if (size === 20) {
        return pinned ? (
            <Icon name="thumbtack-slash" weight="filled" size={20} className="flex-none" />
        ) : (
            <Icon name="thumbtack" weight="filled" size={20} className="flex-none" />
        )
    }
    return pinned ? (
        <Icon name="thumbtack-slash" size={24} className="flex-none" />
    ) : (
        <Icon name="thumbtack" weight="regular" size={24} className="flex-none" />
    )
}

/** The mute pair — the state the row moves *to*, as in the menu. */
function MuteGlyph({ muted, size }: { muted: boolean; size: 20 | 24 }) {
    if (size === 20) {
        return muted ? (
            <Icon name="bell" weight="filled" size={20} className="flex-none" />
        ) : (
            <Icon name="bell-slash" weight="filled" size={20} className="flex-none" />
        )
    }
    return muted ? (
        <Icon name="bell" size={24} className="flex-none" />
    ) : (
        <Icon name="bell-slash" size={24} className="flex-none" />
    )
}

/**
 * Each toolbar button's colour, shown **only under the pointer or focus** — at rest all three are
 * the same quiet `--icon-secondary`, so a list being scanned carries no colour it did not ask for.
 *
 * - **Pin** — indigo, the colour of the pin mark it puts on the avatar. The button previews what
 *   pressing it draws.
 * - **Mute** — warning amber: a notification setting, and the DS's hue for "take note", not for
 *   harm.
 * - **Unfollow** — error red, the one that changes what the reader sees.
 *
 * Ink and tint are the same accent's `-active` / `-bg-focus` pair, both of which flip with the
 * theme. The tint repeats the variant the ghost button already uses (`hover:not-disabled:`), so it
 * *replaces* the grey hover rather than stacking a second background rule beside it. These are
 * glyphs, not sentences — the accent inks fall short of AA for text in Light, and are not used for
 * any here.
 */
const TONE = {
    pin: 'hover:not-disabled:bg-(--accents-indigo-bg-focus) hover:text-(--accents-indigo-active) focus-visible:text-(--accents-indigo-active)',
    mute: 'hover:not-disabled:bg-(--accents-warning-bg-focus) hover:text-(--accents-warning-active) focus-visible:text-(--accents-warning-active)',
    unfollow:
        'hover:not-disabled:bg-(--accents-error-bg-focus) hover:text-(--text-error) focus-visible:text-(--text-error)',
} as const

/**
 * The row's three actions as a toolbar, revealed on **desktop hover** — the desktop form of the
 * kebab, which `FollowingRowMenu` hides wherever this one shows.
 *
 * Not in Figma and not in legacy: a deliberate product call. A menu behind three dots costs two
 * clicks for a toggle that is pressed often and undone freely; on a mouse the actions can simply be
 * there when the cursor is.
 *
 * ## Mounted only where hover is real, and the kebab is the rest of the world
 *
 * `hidden md:pointer-fine:flex`, and the kebab carries the exact opposite. A width breakpoint alone
 * would put this on an iPad with a keyboard cover, where a tap *is* the hover: the first tap reveals,
 * the second presses, and a row that needs two taps has broken the link it is. Phones and tablets
 * keep the kebab.
 *
 * ## One tab stop per row, like the kebab it replaces
 *
 * Now that it is the only path on desktop it has to be reachable without a mouse, but three tab
 * stops per row turns a list of fifty into a hundred and fifty presses. So it is a `toolbar` with a
 * roving tabindex: Tab lands on one button, the arrows (mirrored under RTL) and Home/End move within,
 * and the next Tab leaves the row. Keyboard focus reveals it (`focus-within`) — invisible but
 * focusable would be worse than absent. The toolbar's name carries *whose* row it is; the buttons
 * carry the verb, and the tooltip prints the same word for a pointer.
 *
 * ## Over the text, not beside it
 *
 * Positioned against the CTA slot's start edge, **over** the end of the name line, on the row's hover
 * paint with a fade into the text it covers. In the flow it would widen the CTA slot on every hover,
 * re-truncate the name and handle, and make the list twitch as the cursor moves down it. At rest it
 * is `pointer-events-none`, so a cursor crossing the row cannot press what it cannot see.
 *
 * ## Motion
 *
 * The buttons arrive from the row's **end** (`translate-x-3`, mirrored under `rtl:`) one after
 * another, the end-most first — 40ms apart, 200ms each, the list's own easing — and leave together
 * and faster, because a cursor moving on should not wait for anything. `transform`/`opacity` only;
 * reduced motion keeps the fade and drops the travel and the stagger.
 *
 * ## Unfollow has no confirmation here either
 *
 * Same reason as in the menu: `useFollowedChannels` holds it for five seconds behind an Undo. It is
 * the end-most button.
 */
export function FollowingRowActions({
    channel,
    disabled,
    onTogglePin,
    onToggleMute,
    onUnfollow,
}: {
    channel: FollowedChannel
    disabled?: boolean
    onTogglePin: () => void
    onToggleMute: () => void
    onUnfollow: () => void
}) {
    const { t } = useTranslation()
    const muted = isFollowedChannelMuted(channel)
    const name = channel.name || `@${channel.slug}`
    const [active, setActive] = useState(0)
    const buttons = useRef<(HTMLButtonElement | null)[]>([])

    const actions = [
        {
            key: 'pin',
            label: t(channel.pin ? 'following_unpin' : 'following_pin'),
            glyph: <PinGlyph pinned={channel.pin} size={20} />,
            tone: TONE.pin,
            run: onTogglePin,
        },
        {
            key: 'mute',
            label: t(muted ? 'following_unmute' : 'following_mute'),
            glyph: <MuteGlyph muted={muted} size={20} />,
            tone: TONE.mute,
            run: onToggleMute,
        },
        {
            key: 'unfollow',
            label: t('following_unfollow'),
            glyph: <Icon name="heart-slash" weight="filled" size={20} className="flex-none" />,
            tone: TONE.unfollow,
            run: onUnfollow,
        },
    ]
    const last = actions.length - 1

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
        const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
        const back = rtl ? 'ArrowRight' : 'ArrowLeft'
        let next: number | null = null
        if (event.key === forward) next = active === last ? 0 : active + 1
        else if (event.key === back) next = active === 0 ? last : active - 1
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = last
        if (next === null) return
        event.preventDefault()
        setActive(next)
        buttons.current[next]?.focus()
    }

    return (
        <TooltipProvider>
            <div
                role="toolbar"
                aria-label={t('following_row_actions', { name })}
                aria-orientation="horizontal"
                onKeyDown={onKeyDown}
                className={cn(
                    'group/actions absolute inset-y-0 end-full hidden items-center gap-1 pe-1 md:pointer-fine:flex',
                    // The ground: the row's hover paint, faded in over the text it covers.
                    'before:pointer-events-none before:absolute before:inset-y-0 before:end-full before:w-8',
                    'before:bg-linear-to-l before:from-(--background-segment) before:to-transparent',
                    'rtl:before:bg-linear-to-r',
                    'bg-(--background-segment)',
                    'pointer-events-none opacity-0 transition-opacity duration-150 ease-out',
                    'group-hover/row:pointer-events-auto group-hover/row:opacity-100',
                    'focus-within:pointer-events-auto focus-within:opacity-100',
                )}
            >
                {actions.map((action, i) => (
                    <Tooltip key={action.key} label={action.label} side="top">
                        <button
                            ref={node => {
                                buttons.current[i] = node
                            }}
                            type="button"
                            tabIndex={i === active ? 0 : -1}
                            aria-label={action.label}
                            data-testid="channel-following-action"
                            data-row-key={action.key}
                            disabled={disabled}
                            onFocus={() => setActive(i)}
                            onClick={action.run}
                            style={
                                {
                                    '--enter': `${(last - i) * 40}ms`,
                                } as React.CSSProperties
                            }
                            className={cn(
                                /*
                                 * Not `MENU_TRIGGER`: that one inks `data-[popup-open]` as pressed,
                                 * and the tooltip marks its trigger popup-open — so every button
                                 * went dark the moment its label showed, the destructive one
                                 * included.
                                 */
                                buttonVariants({
                                    variant: 'ghost',
                                    size: 'medium',
                                    iconOnly: true,
                                }),
                                'text-(--icon-secondary)',
                                action.tone,
                                'disabled:pointer-events-none disabled:opacity-50',
                                // Out: together, quick. In: staggered from the end, a touch slower.
                                'translate-x-3 opacity-0 rtl:-translate-x-3',
                                'transition-[translate,opacity,background-color,color] duration-100 ease-out',
                                'group-hover/row:translate-x-0 group-hover/row:opacity-100',
                                'group-hover/row:duration-200 group-hover/row:ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/row:delay-(--enter)',
                                'group-focus-within/actions:translate-x-0 group-focus-within/actions:opacity-100',
                                'motion-reduce:translate-x-0 motion-reduce:delay-0 motion-reduce:group-hover/row:delay-0',
                            )}
                        >
                            {action.glyph}
                        </button>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    )
}
