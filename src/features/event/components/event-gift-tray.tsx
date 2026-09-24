'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { type GiftPackage, giftPackageThumb } from '../api/gift-types'
import { EVENT_STUDIO_GIFT_TRAY, EVENT_STUDIO_GIFT_VARS } from '../lib/studio'

/**
 * **The gift tray** — the strip of gifts along the bottom of the stage, and the tile it is made of.
 *
 * ```
 * ┌────────────────────────────────────────────────────────────┬──────────┐
 * │  🌹      👑      🚀      💎      🎁   →                    │ ⊞ More ▸ │
 * │ Rose    Crown   Rocket  Gem     Box                        │          │
 * │ ★ 1     ★ 99    ★ 500   ★ 1K    ★ 10                       │          │
 * └────────────────────────────────────────────────────────────┴──────────┘
 * ```
 *
 * Legacy's `bottomPanel/gifts`, with three differences, each stated at the line that makes it:
 * native scrolling instead of Swiper, a **button** per tile instead of a `Stack` with an `onClick`,
 * and a *View more* control that is a control rather than a hover trap.
 *
 * ## Ink and ground are literal here, and that is the rule rather than an exception
 *
 * `lib/studio.ts`'s header: this sits on a creator's camera under a scrim, so it does not follow
 * the theme. `EVENT_STUDIO_GIFT_VARS` is the whole palette, declared once on the wrapper.
 */

/**
 * One gift, as a tile.
 *
 * ## It is a `<button>`, and legacy's was not
 *
 * Legacy hangs `onClick` on a `Stack` — a `div`. That is not a style nit on a surface that
 * **spends money**: it is unreachable by keyboard, invisible to a screen reader, and does not
 * respond to Space or Enter. Every tile here is a real button with the gift's name and price in its
 * label, so the thing a reader is about to be charged for is announced before they press it.
 *
 * ## The *Send* bar is `group-hover`, not a `useState`
 *
 * Legacy tracks hover in React state per tile — one state update per pointer crossing, on a strip
 * of twenty tiles, over a playing video. The same effect is a CSS group; the only thing lost is
 * that legacy also *swaps the name out* for the bar, which is a layout jump on hover and is not
 * copied. The bar overlays instead.
 */
function GiftTile({
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
            /*
             * The identity goes in a **companion attribute**, never interpolated into the testid —
             * `docs/TEST_IDS.md`'s rule, and here it is not hypothetical: a gift's id is a number
             * today and the package list is creator-authored.
             */
            data-package-id={pkg.id}
            disabled={disabled || isPending}
            aria-busy={isPending || undefined}
            aria-label={t('event_gift_send_label', {
                name,
                stars: formatStarAmount(pkg.price, currentLanguage),
            })}
            onClick={() => onSend(pkg)}
            className={cn(
                'group relative flex w-[86px] flex-none flex-col items-center justify-center',
                'rounded-xl transition-all',
                'hover:bg-(--live-gift-tile-hover) hover:-translate-y-1',
                // The wire is down, or this tile is the one in flight. Legacy blurs the whole strip
                // on a dead socket; a dimmed, un-pressable tile says the same thing without making
                // the catalogue unreadable.
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
                /*
                 * A package whose product has no picture. `normalizeGiftPackages` already drops a
                 * row with no product at all, so this is the narrower case — and the glyph is
                 * better than an empty 40px hole, which reads as an image that failed to load.
                 */
                <Icon name="gift-simple" size={32} className="flex-none text-white/70" />
            )}
            {/*
             * ⚠ **10px, not 12.** `type-caption-meta` is 12px on a 1.5 line-height — 18px a line —
             * and two of those under a 40px picture is 80px of content in the 75px the strip has.
             * The overflow does not scroll, it **clips**: every gift's name lost its top half, on a
             * bar that otherwise looked finished. Legacy sets 10px here and `type-micro-overline`
             * is the DS's 10px step (at 500 rather than legacy's 600 — the ramp has no 10/600, and
             * a weight is the smaller divergence of the two).
             */}
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

            {/*
             * `Send`, sliding up from the bottom edge on hover. Absolutely positioned so the tile
             * does not change height — legacy removes the name to make room for it, which moves
             * every glyph in the row by 12px as the pointer crosses it.
             */}
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

export interface EventGiftTrayProps {
    packages: GiftPackage[]
    isLoading: boolean
    /** A package is in flight — that tile alone goes busy. */
    pendingId: number | null
    /** False dims the whole strip: no wire, no recipient, nothing to send to. */
    canSend: boolean
    onSend: (pkg: GiftPackage) => void
    /** The catalogue is showing — so the press can close it again, as legacy's does. */
    isCatalogOpen: boolean
    /** Open the full catalogue. Raised on hover **and** on press; see the control itself. */
    onOpenCatalog: () => void
    /** Close it. Only the press uses this — the panel owns leaving with the pointer. */
    onCloseCatalog: () => void
    testId?: string
}

/**
 * The strip.
 *
 * **Nothing at all when the creator offers nothing** — no empty state, no placeholder. This floats
 * over a video: an empty plate saying "no gifts" would take 90px of the stream away to report an
 * absence nobody asked about. Legacy returns `null` on an empty list for the same reason, and it is
 * the one of its early-returns worth keeping.
 */
export function EventGiftTray({
    packages,
    isLoading,
    pendingId,
    canSend,
    onSend,
    isCatalogOpen,
    onOpenCatalog,
    onCloseCatalog,
    testId,
}: EventGiftTrayProps) {
    const { t } = useTranslation()

    if (!isLoading && packages.length === 0) return null

    return (
        <div
            data-testid={testId}
            style={EVENT_STUDIO_GIFT_VARS as CSSProperties}
            className={cn(
                /*
                 * ⚠ **87px, and the number is derived rather than chosen.** Legacy's `BottomPanel`
                 * is `height: 95px` with `padding: 4px 8px`, and `Gifts` is `height: 100%` inside
                 * it — so the strip is 95 − 8 = 87, and its own `6px 12px` leaves **75px** for a
                 * tile. Guessing 90 here is what made the tile's content overflow by five pixels
                 * and clip the names; the rest of this file is measured against that 75.
                 */
                'flex h-[87px] w-full items-stretch overflow-hidden rounded-2xl',
                'bg-(--live-gift-tray) px-3 py-1.5 backdrop-blur-sm',
            )}
        >
            <div className={cn(EVENT_STUDIO_GIFT_TRAY, 'min-w-0 flex-1')}>
                {isLoading
                    ? /*
                       * Four placeholders at the tile's real width — `docs/DESIGN_SYSTEM.md`'s rule
                       * that a skeleton reserves the layout it is standing in for. A spinner here
                       * would resize the strip the moment the catalogue lands, over a playing video.
                       */
                      Array.from({ length: 4 }, (_, i) => (
                          <div
                              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                              key={i}
                              className="flex w-[86px] flex-none flex-col items-center justify-center"
                          >
                              {/*
                               * ⚠ The DS bar's own fill is `--opacity-labels-55`, a **theme** token,
                               * and it inverts — on this grey-over-video plate that is a dark bar in
                               * one mode and a pale one in the other, and one of the two is
                               * invisible. The studio's rule (`lib/studio.ts`) is literal ink on the
                               * stage, so the fill is overridden and only the DS's breathing
                               * animation is kept.
                               */}
                              <Skeleton
                                  className="rounded-lg bg-white/25 opacity-100"
                                  h={40}
                                  w={40}
                              />
                              {/* The two 15px rows the real tile has — see the name's note. */}
                              <div className="flex h-[15px] items-center">
                                  <Skeleton className="bg-white/25 opacity-100" h={8} w={48} />
                              </div>
                              <div className="flex h-[15px] items-center">
                                  <Skeleton className="bg-white/25 opacity-100" h={8} w={28} />
                              </div>
                          </div>
                      ))
                    : packages.map(pkg => (
                          <GiftTile
                              key={pkg.id}
                              pkg={pkg}
                              disabled={!canSend}
                              isPending={pendingId === pkg.id}
                              onSend={onSend}
                              testId={subTestId(testId, 'item')}
                          />
                      ))}
            </div>

            {/*
             * **Hover opens it, and the panel closes itself when the pointer leaves** — legacy's
             * own pair (`onMouseEnter` here, `onMouseLeave` on the panel), and this port shipped
             * without it before being corrected.
             *
             * Note which halves live where, because it is what makes the gesture usable: opening is
             * this control's, closing is the **panel's** alone. Nothing closes on leaving *this*
             * button, so the pointer can cross the gap between the two without the panel vanishing
             * mid-reach.
             *
             * It is still a real `<button>` and the press still toggles, so a reader with no
             * pointer — keyboard, touch, a screen reader — gets the same catalogue. Hover is how it
             * is reached fastest, never the only way it can be reached; the panel keeps Escape for
             * the same reason.
             */}
            <button
                type="button"
                data-testid={subTestId(testId, 'trigger')}
                aria-expanded={isCatalogOpen}
                onMouseEnter={onOpenCatalog}
                onClick={isCatalogOpen ? onCloseCatalog : onOpenCatalog}
                className={cn(
                    /* 110px — legacy's `width: '110px'` on the plate it pins to the trailing edge. */
                    'group ms-2 flex w-[110px] flex-none flex-col items-center justify-center gap-1',
                    'rounded-xl transition-colors hover:bg-(--live-gift-tile-hover)',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                )}
            >
                <Icon
                    name="gift-simple"
                    size={32}
                    className="text-white transition-transform group-hover:scale-110"
                />
                <span className="type-caption-label-strong flex items-center gap-0.5 text-white">
                    {t('event_gift_view_more')}
                    {/* `angle-right` — logical, so it points the other way in Arabic. */}
                    <Icon name="angle-right" size={16} className="rtl:rotate-180" />
                </span>
            </button>
        </div>
    )
}
