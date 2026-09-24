'use client'

import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type CSSProperties, useEffect, useId, useState } from 'react'
import { type GiftPackage, giftPackageThumb } from '../api/gift-types'
import type { LivePublisher } from '../api/live-types'
import { EVENT_STUDIO_GIFT_VARS } from '../lib/studio'

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
    disabled,
    isPending,
    onSend,
    testId,
}: {
    pkg: GiftPackage
    disabled: boolean
    isPending: boolean
    onSend: (pkg: GiftPackage) => void
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const thumb = giftPackageThumb(pkg)
    const name = pkg.product?.name ?? ''

    return (
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
                'group relative flex flex-col items-center justify-start rounded-xl py-2',
                'transition-all hover:-translate-y-1 hover:bg-(--live-gift-tile-hover)',
                'disabled:pointer-events-none disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            )}
        >
            {thumb ? (
                <Image
                    src={thumb}
                    alt=""
                    aria-hidden
                    width={40}
                    height={40}
                    className="size-10 flex-none object-contain transition-transform group-hover:scale-110"
                />
            ) : (
                <Icon name="gift-simple" size={32} className="flex-none text-white/70" />
            )}
            {/* 10px, for the reason `event-gift-tray.tsx` states at length. */}
            <span className="type-micro-overline w-full truncate px-1 text-center text-white">
                {name}
            </span>
            {/*
             * ⚠ **`formatStarAmount`, not `formatCount`.** This is a price the reader is about to
             * be charged, and `formatCount` is compact — a 1,049-Star gift would advertise
             * itself as `1k`. Legacy uses a plain `formatNumber` here for the same reason, and
             * `shared/lib/money.ts` is this app's spelling of that. The chat's after-the-fact
             * `x{formatCount(…)}` is a different thing: a record, not an offer.
             */}
            <span className="flex items-center gap-0.5">
                <StarMark size={10} />
                <span className="type-micro-overline text-(--live-gift-price) transition-colors group-hover:text-white">
                    {formatStarAmount(pkg.price, currentLanguage)}
                </span>
            </span>
            <span
                aria-hidden
                className={cn(
                    'absolute inset-x-0 bottom-0 flex h-[19px] items-center justify-center',
                    'rounded-b-xl type-micro-overline text-white',
                    'bg-(--live-gift-send) group-hover:bg-(--live-gift-send-hover)',
                    'opacity-0 transition-opacity group-hover:opacity-100',
                )}
            >
                {t('event_gift_send')}
            </span>
        </button>
    )
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
    return (
        <div className="flex-none">
            <button
                type="button"
                data-testid={subTestId(testId, 'trigger')}
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen(open => !open)}
                className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-start',
                    'bg-(--live-gift-header) transition-colors hover:bg-white/10',
                )}
            >
                <span className="type-caption-meta min-w-0 truncate text-white">
                    {/*
                     * The sentence names the person once one is chosen, rather than only
                     * advertising that a choice exists — legacy prints "The lucky creator will
                     * receive your gift" and nothing else, so the reader cannot tell from the
                     * closed state who they are about to pay.
                     */}
                    {selected?.name
                        ? t('event_gift_recipient_named', { name: selected.name })
                        : t('event_gift_recipient_prompt')}
                </span>
                <Icon
                    name="angle-down"
                    size={16}
                    className={cn(
                        'flex-none text-white/70 transition-transform',
                        isOpen && 'rotate-180',
                    )}
                />
            </button>
            {isOpen && (
                <div
                    id={listId}
                    role="radiogroup"
                    aria-label={t('event_gift_recipient_prompt')}
                    data-testid={subTestId(testId, 'list')}
                    className="max-h-[160px] overflow-y-auto bg-black/20"
                >
                    {publishers.map(publisher => (
                        <label
                            key={publisher.id}
                            className={cn(
                                'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors',
                                'hover:bg-white/10 has-[:focus-visible]:bg-white/10',
                                selected?.id === publisher.id && 'bg-(--live-gift-header)',
                            )}
                        >
                            {/*
                             * ⚠ **A real radio, visually hidden**, rather than a `role="radio"` on
                             * the row. Both the row and the group would be ARIA roles bolted to
                             * non-interactive elements, and then this file would owe the whole
                             * roving-`tabIndex` keyboard machine that `shared/components/picker-list.tsx`
                             * already carries for exactly one other screen. A native group gives
                             * arrow-key navigation, the checked state and form semantics for free —
                             * and `sr-only` keeps it out of the way of the drawn row.
                             */}
                            <input
                                type="radio"
                                name={listId}
                                value={publisher.id ?? ''}
                                checked={selected?.id === publisher.id}
                                onChange={() => {
                                    if (publisher.id) onSelect(publisher)
                                    setIsOpen(false)
                                }}
                                data-testid={subTestId(testId, 'option')}
                                data-option-value={publisher.id}
                                className="sr-only"
                            />
                            {/* 24px, the same disc the chat column uses for every person. */}
                            <Avatar
                                size="xs"
                                type={publisher.avatar ? 'image' : 'initials'}
                                className="size-6 flex-none"
                            >
                                {publisher.avatar ? (
                                    <Image
                                        src={publisher.avatar}
                                        alt=""
                                        width={24}
                                        height={24}
                                        className="size-full rounded-full object-cover"
                                    />
                                ) : (
                                    <AvatarInitials>
                                        {(publisher.name ?? '?').slice(0, 2).toUpperCase()}
                                    </AvatarInitials>
                                )}
                            </Avatar>
                            <span className="type-dense-emphasis min-w-0 flex-1 truncate text-(--live-gift-recipient)">
                                {publisher.name}
                            </span>
                            {publisher.verified_tick_badge?.image && (
                                <VerifiedBadge
                                    image={publisher.verified_tick_badge.image}
                                    size={16}
                                />
                            )}
                            {publisher.is_host && (
                                <span className="type-caption-meta flex-none rounded-(--radius-fill) bg-black/40 px-1.5 py-0.5 text-white">
                                    {t('event_gift_recipient_host')}
                                </span>
                            )}
                        </label>
                    ))}
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
                'flex w-[390px] max-w-full flex-col overflow-hidden rounded-lg',
                'bg-(--live-gift-panel) shadow-2xl backdrop-blur-sm',
                /*
                 * It fills whatever its wrapper gives it, up to its content — legacy's `Content` is
                 * `height: calc(100% - 100px)` of a full-height panel, i.e. very nearly the stage.
                 * The `min(70vh, 520px)` this had cut a 32-gift catalogue down to four rows and a
                 * scrollport, where legacy shows seven.
                 */
                'max-h-full',
            )}
        >
            <header className="flex flex-none items-center justify-between gap-2 bg-(--live-gift-header) px-4 py-1">
                <p
                    id={headingId}
                    className="type-caption-meta min-w-0 text-(--live-gift-header-ink)"
                >
                    {t('event_gift_panel_title')}
                </p>
                {/*
                 * The close control at the **trailing** edge, which is §7's rule for a card rather
                 * than a screen: this is a plate floating on the stage, not a ported full-screen.
                 */}
                <button
                    type="button"
                    data-testid={subTestId(testId, 'close')}
                    aria-label={t('common_close')}
                    onClick={onClose}
                    className="flex size-10 flex-none items-center justify-center rounded-(--radius-fill) text-white transition-colors hover:bg-white/10"
                >
                    {/* MUI's `IconButton` is a 40px target with a 24px glyph; legacy takes both. */}
                    <Icon name="xmark" size={24} />
                </button>
            </header>

            {/*
             * ⚠ **Two tabs that do not partition.** *Gifts* is the whole catalogue, exclusives
             * included; *Exclusive* is a subset of it. That is legacy's behaviour and it is stated
             * at `splitGiftPackages` too, because the obvious reading of two tabs is the other one.
             */}
            {/* Legacy's `Tabs`: `minHeight: 40`, scroller `padding: '0 12px 12px 12px'`. */}
            <div role="tablist" className="flex min-h-10 flex-none items-end gap-2 px-3 pb-3">
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
                            /*
                             * ⚠ **`type-caption-meta`, and this said `type-caption-default`.**
                             * That utility does not exist — `globals.css` ships
                             * `type-caption-label`, `-label-strong` and `-meta`, and nothing else
                             * at 12px. An unknown `type-*` class is not a build error and not a
                             * lint error: Tailwind emits nothing and the element silently inherits
                             * the body's 16px, which is why these tabs were half again the size of
                             * legacy's 12/400 and nothing caught it.
                             */
                            'type-caption-meta px-2 py-1 transition-colors',
                            /*
                             * The chosen tab carries a 2px rule under it — MUI's `Tabs` indicator,
                             * which legacy gets for free and which is the only thing marking the
                             * selection besides the ink. Without it the two tabs read as one bright
                             * label and one dim one.
                             */
                            'border-b-2',
                            tab === value
                                ? 'border-(--live-gift-send) text-white'
                                : 'border-transparent text-(--live-gift-tab) hover:text-white/80',
                        )}
                    >
                        {value === 'all' ? t('event_gift_tab_all') : t('event_gift_tab_exclusive')}
                    </button>
                ))}
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

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
                    /* `spacing={2}` on legacy's `Grid` is **16px**, not the 8 this shipped with. */
                    <div className="grid grid-cols-4 gap-4">
                        {rows.map(pkg => (
                            <GiftGridTile
                                key={pkg.id}
                                pkg={pkg}
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
