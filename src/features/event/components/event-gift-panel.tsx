'use client'

import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { LIVE_BREATH, POP, RISE } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type CSSProperties, useEffect, useId, useState } from 'react'
import { type GiftPackage, giftPackageThumb } from '../api/gift-types'
import type { LivePublisher } from '../api/live-types'
import { EVENT_STUDIO_GIFT_VARS } from '../lib/studio'
import { EventHostBadge } from './event-host-badge'
import { NAME_SLOT } from './name-with-tick'

/**
 * **The gift catalogue** — the 390px panel the tray's *View more* opens.
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │ Make this moment shine!! Send your gift now! ✕│  ← the amber header wash
 * ├──────────────────────────────────────────────┤
 * │ Gifts │ Exclusive                            │  ← two tabs, and they do not partition
 * ├──────────────────────────────────────────────┤
 * │ ◍ Leslie Alexander ✓            Host      ▾ │  ← only on a multi-host broadcast
 * ├──────────────────────────────────────────────┤
 * │  🌹      👑      🚀      💎                  │
 * │ Rose    Crown   Rocket  Gem                  │
 * │ ★ 1     ★ 99    ★ 500   ★ 1K                 │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * Legacy's `rightPanel/productPackages`, gesture included: **the tray's *View more* opens it on
 * hover and this panel closes itself when the pointer leaves it.** That pair is legacy's, it is what
 * the product asks for, and the port had replaced it with a press before being corrected.
 *
 * What is added rather than changed: the press still toggles, Escape still closes, and the tabs are
 * real tabs — so the same catalogue is reachable without a pointer. None of that alters what the
 * pointer does.
 *
 * ## Not a DS dialog, and not a `role="dialog"`
 *
 * `docs/DESIGN_SYSTEM.md` §7's dismiss rules are about dialogs; this is a panel docked to the stage,
 * the stream keeps playing behind it, and nothing about it is modal — a reader can chat, press the
 * tray, or leave while it is open. Declaring it a dialog would promise a focus trap and a backdrop
 * that deliberately do not exist. So: a labelled region with a close control, which is what it is.
 */

/**
 * One gift, as a grid tile — the panel's, four to a row.
 *
 * Deliberately **not** shared with the tray's tile: the two differ in width, in how the name wraps,
 * and in whether the *Send* bar overlays or sits under the price. Sharing them would mean a
 * component with two layout props whose only caller of each is one of the two — the cost
 * `shared/ui`'s note about `picker-list.tsx` describes from the other side.
 */
function GiftGridTile({
    pkg,
    index,
    disabled,
    isPending,
    onSend,
    testId,
}: {
    pkg: GiftPackage
    index: number
    disabled: boolean
    isPending: boolean
    onSend: (pkg: GiftPackage) => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const thumb = giftPackageThumb(pkg)
    const name = pkg.product?.name ?? ''

    return (
        /*
         * The run-in, 20ms apart and capped — the tray's stagger, and on a wrapper for the tray's
         * reason: `RISE` holds `translate` once it finishes, which would cancel the hover lift.
         * The grid is keyed on the tab, so switching tabs replays it.
         */
        <span
            className={cn('flex', RISE)}
            style={{ animationDelay: `${Math.min(index, 16) * 20}ms` }}
        >
            <button
                type="button"
                data-testid={testId}
                data-package-id={pkg.id}
                disabled={disabled || isPending}
                aria-busy={isPending || undefined}
                aria-label={t('event_gift_send_label', {
                    name,
                    stars: formatStarAmount(pkg.price, currentLanguage),
                })}
                onClick={() => onSend(pkg)}
                className={cn(
                    'group relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-xl px-1 pt-3 pb-2',
                    'transition-[background-color,translate,scale] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                    'hover:-translate-y-0.5 hover:bg-white/[0.06] active:scale-95',
                    'motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
                    'disabled:pointer-events-none disabled:opacity-50',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                )}
            >
                {thumb ? (
                    <Image
                        src={thumb}
                        alt=""
                        aria-hidden
                        width={48}
                        height={48}
                        className={cn(
                            'size-12 flex-none object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]',
                            'transition-[scale,rotate] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                            'group-hover:scale-115 group-hover:-rotate-6 rtl:group-hover:rotate-6',
                            'motion-reduce:transition-none',
                            isPending && LIVE_BREATH,
                        )}
                    />
                ) : (
                    <Icon name="gift-simple" size={32} className="my-2 flex-none text-white/70" />
                )}
                {/*
                 * 12px here, where the tray needs 10: the tray's limit is its 75px strip, and the
                 * panel scrolls, so its tiles can be as tall as a legible label wants.
                 */}
                <span className="type-caption-label w-full truncate text-center text-white">
                    {name}
                </span>
                {/*
                 * ⚠ **`formatStarAmount`, not `formatCount`.** This is a price the reader is about
                 * to be charged, and `formatCount` is compact — a 1,049-Star gift would advertise
                 * itself as `1k`. Legacy uses a plain `formatNumber` here for the same reason.
                 *
                 * The *Send* drawer slides up over this row on hover.
                 */}
                <span className="flex h-[18px] items-center gap-0.5">
                    <StarMark size={12} />
                    <span className="type-caption-meta tabular-nums text-(--live-gift-price)">
                        {formatStarAmount(pkg.price, currentLanguage)}
                    </span>
                </span>
                {/*
                 * Just *Send*: the price stays the row it covers' business, and a tile 85px wide
                 * cannot fit "Send ★ 10,000". `opacity` rides with the slide so the drawer, parked
                 * one pixel under the tile's rounded edge, never bleeds a violet line while the
                 * tile itself is moving (its run-in).
                 */}
                <span
                    aria-hidden
                    className={cn(
                        'absolute inset-x-0 bottom-0 flex h-[26px] items-center justify-center',
                        'type-caption-label-strong text-white',
                        'bg-(--live-gift-send) group-hover:bg-(--live-gift-send-hover)',
                        'translate-y-full opacity-0 transition-[translate,opacity] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                        'group-hover:translate-y-0 group-hover:opacity-100',
                        'group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none',
                    )}
                >
                    {t('event_gift_send')}
                </span>
            </button>
        </span>
    )
}

/**
 * A translated sentence split around its name slot, keeping the slot as its own piece — so the
 * name can be laid out as a flex item in whichever position the locale puts it.
 */
function recipientParts(sentence: string): string[] {
    const [before, ...rest] = sentence.split(NAME_SLOT)
    if (rest.length === 0) return [sentence]
    return [before, NAME_SLOT, rest.join('')]
}

/**
 * **Who gets it**, on a broadcast with more than one person on camera.
 *
 * Hidden entirely below two publishers, which is legacy's rule (`publishers.length <= 1`) and the
 * right one: a solo stream has exactly one possible recipient, and a picker offering one choice is
 * a control that can only be pressed to confirm what was already true.
 *
 * ## A `<select>`-shaped disclosure, not an accordion that opens on hover
 *
 * Legacy's MUI `Accordion` expands on `onMouseEnter` and collapses on `onMouseLeave`, so choosing a
 * recipient means holding the pointer inside a list that closes if it strays — and it cannot be
 * opened at all by keyboard. This is a button that toggles, with a listbox under it.
 */
function RecipientPicker({
    publishers,
    selected,
    onSelect,
    testId,
}: {
    publishers: LivePublisher[]
    selected: LivePublisher | null
    onSelect: (publisher: LivePublisher) => void
    testId?: string
}) {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const listId = useId()

    if (publishers.length <= 1) return null

    /*
     * ⚠ **A radiogroup below, not a listbox with `aria-selected`.**
     *
     * `aria-selected` is only valid on `option` / `tab` / `row` / `gridcell` / `treeitem`, and a
     * `role="option"` may not *contain* the interactive element that presses it — so the obvious
     * listbox spelling is invalid twice over. Picking exactly one recipient out of several is what
     * a radio group is; `role="radio"` is valid on a button, and `aria-checked` is the state QC
     * reads (`docs/TEST_IDS.md`: state is published as `aria-*`, never encoded in a testid).
     */
    /** A person's 24/28px disc — the chat column's, so a face reads the same everywhere. */
    const face = (publisher: LivePublisher, px: number, className?: string) => (
        <Avatar
            size="xs"
            type={publisher.avatar ? 'image' : 'initials'}
            className={cn('flex-none', className)}
            style={{ width: px, height: px }}
        >
            {publisher.avatar ? (
                <Image
                    src={publisher.avatar}
                    alt=""
                    width={px}
                    height={px}
                    className="size-full rounded-full object-cover"
                />
            ) : (
                <AvatarInitials>{(publisher.name ?? '?').slice(0, 2).toUpperCase()}</AvatarInitials>
            )}
        </Avatar>
    )

    return (
        <div className="flex-none">
            {/*
             * The trigger names who will be paid, with their face — the closed state should say
             * *who* without opening. The chevron sits on its own disc and turns as the list opens.
             */}
            <button
                type="button"
                data-testid={subTestId(testId, 'trigger')}
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen(open => !open)}
                className={cn(
                    'group/trigger flex h-12 w-full items-center gap-2.5 px-3 text-start',
                    'bg-(--live-gift-header) transition-colors hover:bg-white/[0.12]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50',
                )}
            >
                {selected &&
                    face(selected, 28, 'ring-2 ring-[#7C4DFF] ring-offset-1 ring-offset-black/40')}
                {/*
                 * The sentence names the person once one is chosen, rather than only advertising
                 * that a choice exists — legacy prints "The lucky creator will receive your gift"
                 * and nothing else, so the reader cannot tell from the closed state who they are
                 * about to pay.
                 *
                 * ⚠ **One flex row, centred**, not `NameWithTick` inline. That component wraps the
                 * name in an `inline-flex` on `align-middle`, which centres the name's box on the
                 * line's x-height rather than sitting its text on the baseline — so a name a size
                 * up from the words around it rode visibly off their line. Here every piece is a
                 * flex item on one **baseline** (the words and the name share it whatever their
                 * sizes), the tick is centred on the name, and the name is the only part that
                 * truncates.
                 */}
                {selected?.name ? (
                    <span className="flex min-w-0 flex-1 items-baseline gap-1">
                        {recipientParts(t('event_gift_recipient_named', { name: NAME_SLOT })).map(
                            (part, i) =>
                                part === NAME_SLOT ? (
                                    <span key="name" className="flex min-w-0 items-center gap-1">
                                        <span className="type-dense-emphasis min-w-0 truncate text-white">
                                            {selected.name}
                                        </span>
                                        {selected.verified_tick_badge?.image && (
                                            <VerifiedBadge
                                                image={selected.verified_tick_badge.image}
                                                size="dense"
                                            />
                                        )}
                                    </span>
                                ) : (
                                    part.trim() && (
                                        <span
                                            // biome-ignore lint/suspicious/noArrayIndexKey: a sentence's fixed pieces.
                                            key={i}
                                            className="type-caption-meta flex-none whitespace-nowrap text-white/60"
                                        >
                                            {part.trim()}
                                        </span>
                                    )
                                ),
                        )}
                    </span>
                ) : (
                    <span className="type-caption-meta min-w-0 flex-1 truncate text-white/60">
                        {t('event_gift_recipient_prompt')}
                    </span>
                )}
                <span className="grid size-7 flex-none place-items-center rounded-full bg-white/[0.08] text-white/70 transition-colors group-hover/trigger:bg-white/15 group-hover/trigger:text-white">
                    <Icon
                        name="angle-down"
                        size={16}
                        className={cn(
                            'transition-transform duration-200 motion-reduce:transition-none',
                            isOpen && 'rotate-180',
                        )}
                    />
                </span>
            </button>
            {isOpen && (
                <div
                    id={listId}
                    role="radiogroup"
                    aria-label={t('event_gift_recipient_prompt')}
                    data-testid={subTestId(testId, 'list')}
                    className={cn(
                        'flex max-h-[184px] flex-col gap-0.5 overflow-y-auto bg-black/25 p-1.5',
                        'animate-[tevi-chart-fade_200ms_ease-out_both] motion-reduce:animate-none',
                    )}
                >
                    {publishers.map((publisher, index) => {
                        const isSelected = selected?.id === publisher.id
                        return (
                            <label
                                key={publisher.id}
                                className={cn(
                                    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                                    'hover:bg-white/[0.08] has-[:focus-visible]:bg-white/[0.08] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/40',
                                    isSelected &&
                                        'bg-[rgba(124,77,255,0.18)] ring-1 ring-inset ring-[rgba(196,170,255,0.3)] hover:bg-[rgba(124,77,255,0.24)]',
                                    RISE,
                                )}
                                // The rows arrive one after another as the list opens.
                                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                            >
                                {/*
                                 * ⚠ **A real radio, visually hidden**, rather than a `role="radio"`
                                 * on the row — a native group gives arrow-key navigation, the
                                 * checked state and form semantics for free (`picker-list.tsx`
                                 * carries the roving-tabIndex machine this would otherwise owe).
                                 */}
                                <input
                                    type="radio"
                                    name={listId}
                                    value={publisher.id ?? ''}
                                    checked={isSelected}
                                    onChange={() => {
                                        if (publisher.id) onSelect(publisher)
                                        setIsOpen(false)
                                    }}
                                    data-testid={subTestId(testId, 'option')}
                                    data-option-value={publisher.id}
                                    className="sr-only"
                                />
                                {face(publisher, 28)}
                                {/*
                                 * Name, then its marks — the tick and the Host badge ride **right
                                 * after** the name, as everywhere else a name is printed, rather
                                 * than being pushed to the row's far end. The name is the one part
                                 * that shrinks; the group takes the row's slack.
                                 */}
                                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <span
                                        className={cn(
                                            'type-dense-emphasis min-w-0 truncate',
                                            isSelected
                                                ? 'text-white'
                                                : 'text-(--live-gift-recipient)',
                                        )}
                                    >
                                        {publisher.name}
                                    </span>
                                    {publisher.verified_tick_badge?.image && (
                                        <VerifiedBadge
                                            image={publisher.verified_tick_badge.image}
                                            size="dense"
                                        />
                                    )}
                                    {/* Legacy's gold host badge — the one the pinned message wears. */}
                                    {publisher.is_host && <EventHostBadge />}
                                </span>
                                {/* The pick, ticked — it pops in as the choice lands. */}
                                <span className="grid size-5 flex-none place-items-center">
                                    {isSelected && (
                                        <span
                                            className={cn(
                                                'grid size-5 place-items-center rounded-full bg-[#7C4DFF] text-white shadow-[0_2px_6px_rgba(124,77,255,0.5)]',
                                                POP,
                                            )}
                                        >
                                            <Icon name="check" size={16} className="size-3" />
                                        </span>
                                    )}
                                </span>
                            </label>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export interface EventGiftPanelProps {
    packages: GiftPackage[]
    exclusive: GiftPackage[]
    publishers: LivePublisher[]
    /** The chosen recipient, or `null` on a solo broadcast — then the host is implied. */
    recipient: LivePublisher | null
    onSelectRecipient: (publisher: LivePublisher) => void
    pendingId: number | null
    canSend: boolean
    onSend: (pkg: GiftPackage, recipient: LivePublisher | null) => void
    onClose: () => void
    testId?: string
}

type GiftTab = 'all' | 'exclusive'

export function EventGiftPanel({
    packages,
    exclusive,
    publishers,
    recipient,
    onSelectRecipient,
    pendingId,
    canSend,
    onSend,
    onClose,
    testId,
}: EventGiftPanelProps) {
    const { t } = useTranslation()
    const [tab, setTab] = useState<GiftTab>('all')
    const headingId = useId()

    /*
     * **Escape closes it too.** Legacy's only dismissals are the ✕ and the pointer leaving, so a
     * reader who opened this from the keyboard has no way out of it. An addition, not a
     * replacement — the pointer behaviour below is legacy's, untouched. No focus trap: the panel
     * is not modal and the stream keeps playing behind it (see the header).
     */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    const rows = tab === 'exclusive' ? exclusive : packages

    return (
        <section
            data-testid={testId}
            aria-labelledby={headingId}
            /*
             * ⚠ **Leaving the panel closes it** — legacy's `onMouseLeave` on the same box, and the
             * other half of the tray's hover-to-open.
             *
             * It sits on the panel and **not** on the *View more* button, which is what lets the
             * pointer travel from one to the other: a leave handler on the trigger would shut the
             * panel in the gap between them, before it could be reached.
             */
            onMouseLeave={onClose}
            style={EVENT_STUDIO_GIFT_VARS as CSSProperties}
            className={cn(
                'flex w-[390px] max-w-full flex-col overflow-hidden rounded-2xl',
                // The tray's corner and hairline, so the panel reads as the tray opened up.
                'bg-(--live-gift-panel) shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur-sm',
                // It rises out of the tray it was opened from.
                RISE,
                /*
                 * It fills whatever its wrapper gives it, up to its content — legacy's `Content` is
                 * `height: calc(100% - 100px)` of a full-height panel, i.e. very nearly the stage.
                 * The `min(70vh, 520px)` this had cut a 32-gift catalogue down to four rows and a
                 * scrollport, where legacy shows seven.
                 */
                'max-h-full',
            )}
        >
            <header className="flex flex-none items-center gap-3 bg-(--live-gift-header) py-2 ps-4 pe-2">
                {/* The platform's amber, as a tinted disc — the sentence's own colour, given a mark. */}
                <span
                    aria-hidden
                    className="grid size-8 flex-none place-items-center rounded-full bg-(--live-gift-header-ink)/15 text-(--live-gift-header-ink)"
                >
                    <Icon name="gift-simple" size={18} />
                </span>
                <p
                    id={headingId}
                    // 12/600, so the sentence holds one line beside the mark and the close.
                    className="type-caption-label-strong min-w-0 flex-1 text-(--live-gift-header-ink)"
                >
                    {t('event_gift_panel_title')}
                </p>
                {/*
                 * The close control at the **trailing** edge, which is §7's rule for a card rather
                 * than a screen: this is a plate floating on the stage, not a ported full-screen.
                 * §7's own geometry — a 40px target with a 20px `xmark`.
                 */}
                <button
                    type="button"
                    data-testid={subTestId(testId, 'close')}
                    aria-label={t('common_close')}
                    onClick={onClose}
                    className={cn(
                        'grid size-10 flex-none place-items-center rounded-full text-white/70',
                        'transition-[background-color,color,rotate] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                        'hover:rotate-90 hover:bg-white/10 hover:text-white motion-reduce:transition-none motion-reduce:hover:rotate-0',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                    )}
                >
                    <Icon name="xmark" size={20} />
                </button>
            </header>

            {/*
             * ⚠ **Two tabs that do not partition.** *Gifts* is the whole catalogue, exclusives
             * included; *Exclusive* is a subset of it. That is legacy's behaviour and it is stated
             * at `splitGiftPackages` too, because the obvious reading of two tabs is the other one.
             */}
            {/*
             * A segmented control rather than MUI's underlined tabs: two equal halves on a recessed
             * track, with one violet thumb that **slides** between them. The thumb is the selection
             * mark the 2px rule used to be — one moving object instead of a rule that blinks from
             * one label to the other. `translate-x-full` is physical, so RTL carries its mirror.
             */}
            <div className="flex-none px-3 pt-3 pb-2">
                <div
                    role="tablist"
                    className="relative grid h-9 grid-cols-2 rounded-full bg-black/25 p-1"
                >
                    <span
                        aria-hidden
                        className={cn(
                            'absolute inset-y-1 start-1 w-[calc(50%-4px)] rounded-full bg-(--live-gift-send) shadow-sm',
                            'transition-[translate] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                            tab === 'exclusive' && 'translate-x-full rtl:-translate-x-full',
                        )}
                    />
                    {(['all', 'exclusive'] as const).map(value => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            data-testid={subTestId(testId, 'tab')}
                            data-option-value={value}
                            aria-selected={tab === value}
                            onClick={() => setTab(value)}
                            className={cn(
                                'type-caption-label-strong relative z-10 rounded-full transition-colors',
                                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                                tab === value
                                    ? 'text-white'
                                    : 'text-(--live-gift-tab) hover:text-white/80',
                            )}
                        >
                            {value === 'all'
                                ? t('event_gift_tab_all')
                                : t('event_gift_tab_exclusive')}
                        </button>
                    ))}
                </div>
            </div>

            <RecipientPicker
                publishers={publishers}
                selected={recipient}
                onSelect={onSelectRecipient}
                /*
                 * The panel's **own** base, not a derived one: `subTestId` is resolved one level
                 * deep by the catalog builder, so a twice-derived id (`…-option-option`) is both
                 * unreadable and a catalog failure. The picker's three parts — `trigger`, `list`,
                 * `option` — do not collide with any the panel writes itself.
                 */
                testId={testId}
            />

            {/*
             * The scrollport fades at both edges, so a row half-scrolled out of view dissolves under
             * the tabs rather than being sliced by them — the tray's mask, turned vertical.
             */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3 [mask-image:linear-gradient(to_bottom,transparent,black_8px,black_calc(100%-12px),transparent)]">
                {rows.length === 0 ? (
                    /*
                     * The *Exclusive* tab with nothing in it is the case this exists for, and it is
                     * a real one: `include_exclusive` asks for member-only products and a creator
                     * who sells none gets an empty tab. Legacy renders `null` — an empty panel with
                     * a tab bar above it, which reads as a failed load.
                     */
                    <p
                        data-testid={subTestId(testId, 'empty')}
                        className="type-caption-meta px-4 py-8 text-center text-(--live-gift-tab)"
                    >
                        {tab === 'exclusive'
                            ? t('event_gift_empty_exclusive')
                            : t('event_gift_empty')}
                    </p>
                ) : (
                    /*
                     * 4px between tiles and the room inside them instead: legacy's `spacing={2}` is
                     * 16px of gutter between tiles whose hover plate stops at the picture, so the
                     * grid read as loose. Here each tile's own padding is the spacing, and the
                     * hover plate fills its cell. Keyed on the tab so the run-in replays.
                     */
                    <div key={tab} className="grid grid-cols-4 gap-1">
                        {rows.map((pkg, index) => (
                            <GiftGridTile
                                key={pkg.id}
                                pkg={pkg}
                                index={index}
                                disabled={!canSend}
                                isPending={pendingId === pkg.id}
                                onSend={p => onSend(p, recipient)}
                                testId={subTestId(testId, 'item')}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}
