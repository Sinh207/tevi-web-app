'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Badge, type BadgeStatus } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { ChannelEvent } from '../api/events-api'
import { formatActivityDateTime } from '../lib/channel-format'
import { ChannelEventMenu } from './channel-event-menu'

/**
 * One row of the Live tab: a 16:9 banner, the title, when it starts, and a status chip.
 *
 * ## The status chip is the DS `Badge`, not legacy's coloured pill
 *
 * Legacy paints white text on six hard-coded fills — `#F43F5E` live, `#FF7C00` coming-soon and
 * paused, `#501bc0` preparing, `#666666` ended, `#131313` cancelled. I ported that onto the nearest
 * DS accent tokens, which was the wrong fix in two ways, and measuring it in the browser is what
 * showed both.
 *
 * **It fails contrast.** White on `--accents-warning-active` is **2.94:1** and on
 * `--accents-error-active` **3.60:1** — WCAG 1.4.3 wants 4.5 for text this size. Legacy's own hexes
 * are no better; the pattern is the problem, not the palette.
 *
 * **And `--text-title` inverts.** Cancelled was black-on-light and became *white on white* in dark
 * mode: contrast **1.00**, the chip and its label both gone. The Zinc ramp flipping between modes is
 * written down in `CLAUDE.md`, and I used a token that flips as a *background* while pinning the
 * foreground to `--white`.
 *
 * The DS already solved this: `Badge` pairs a **tinted** background with matching accent text
 * (`--accents-error-bg-active` + `--accents-error-active`), so both halves move together and the
 * pairing is designed rather than assumed. Mapping onto its roles also says something legacy's six
 * hexes could not — `disabled` is what "cancelled" *means*.
 *
 * | status | legacy fill | DS role |
 * |---|---|---|
 * | `LIVE` | `#F43F5E` | `error` |
 * | `PUBLISHED` → "Coming soon" | `#FF7C00` | `warning` |
 * | `PAUSED` | `#ff7c00` | `warning` |
 * | `PREPARING` | `#501bc0` | `info` |
 * | `ENDED` | `#666666` | `default` |
 * | `CANCELLED` | `#131313` | `outline` |
 *
 * ⚠ `disabled` was the first choice for cancelled, because it is what the word *means*. Measured, it
 * is **1.34:1** in light and **1.59** in dark — near-invisible, which is correct for a control you
 * are not allowed to press and wrong for a label you are meant to read. `outline` is the role for
 * "present, not accented": 4.83 and 8.19, and a bordered chip still reads as a different kind of
 * thing from `default`'s filled grey, so ended and cancelled stay distinguishable.
 *
 * ⚠ Three of the DS's own pairs are under 4.5:1 in **light** mode — `warning` 2.84, `error` 3.29,
 * `info` 3.62 (all pass in dark). Those are the design system's own token couples and not mine to
 * re-mix, so they ship as-is and the finding goes to whoever owns the ramp. Worth knowing before
 * anyone "fixes" this file: the numbers are measured, and the cause is upstream.
 *
 * An unknown status renders **no chip** rather than an empty coloured pill — legacy's `default` case
 * returns `{label: '', color: ''}`, which paints a transparent 22px box with nothing in it.
 *
 * ## What is not here yet
 *
 * The per-card menu (Share · Get QR Code · Cancel) needs the DS `dropdown` / `bottom-sheet`, neither
 * of which is ported, and Cancel additionally needs a confirmation and a write. Same blocker, and the
 * same resolution, as the channel bar's overflow menu — except that this menu genuinely has three
 * items, so it cannot be flattened into a button the way "Leave this MCN" was.
 */
const STATUS_BADGE: Record<string, { key: string; status: BadgeStatus }> = {
    LIVE: { key: 'channel_event_live', status: 'error' },
    PUBLISHED: { key: 'channel_event_coming_soon', status: 'warning' },
    PAUSED: { key: 'channel_event_paused', status: 'warning' },
    PREPARING: { key: 'channel_event_preparing', status: 'info' },
    ENDED: { key: 'channel_event_ended', status: 'default' },
    CANCELLED: { key: 'channel_event_cancelled', status: 'outline' },
}

export function ChannelEventCard({ event, slug }: { event: ChannelEvent; slug: string }) {
    const { t, currentLanguage } = useTranslation()
    const badge = event.status ? STATUS_BADGE[event.status] : undefined
    const title = event.title ?? t('channel_event_untitled')
    const startAt = formatActivityDateTime(event.start_at, currentLanguage)

    /**
     * The whole row is the link, and it only becomes one when there is a `code` to link to. An event
     * with no code is a row you can look at — wrapping it in an anchor to nowhere would be a control
     * that does nothing.
     */
    const href = event.code ? `/@${slug}/event/${encodeURIComponent(event.code)}` : null

    return (
        /*
         * The row is a flex container, **not** the link. It used to be an `<a>` wrapping everything,
         * which was fine until the menu arrived: a `<button>` inside an `<a>` is invalid HTML, and
         * the browser's recovery is to hoist it out — which breaks the menu's positioning and makes
         * the whole row activate when you reach for the kebab.
         *
         * So the link is a full-bleed overlay pinned behind the menu instead. The hover still paints
         * on the row (`group-hover`), the whole banner-and-text area is still clickable, and the
         * menu sits above it in the stacking order with its own hit area.
         */
        <div
            className={cn(
                'group relative flex min-w-0 items-start gap-4 rounded-(--radius-lg) p-1',
                href && 'transition-colors hover:bg-(--background-subtle)',
            )}
        >
            {href && (
                <a
                    href={href}
                    // `inset-0` under everything, so the row reads as one target to a pointer while
                    // the menu keeps its own. `z-0` against the menu's `z-10` is the whole trick.
                    className="absolute inset-0 z-0 rounded-(--radius-lg)"
                >
                    {/*
                     * Real content, not an `aria-label`. An empty anchor is what
                     * `lint/a11y/useAnchorContent` catches, and the rule is right: some assistive
                     * tech ignores `aria-label` on a link and announces the href, so an overlay
                     * link with no text reads out as a URL. The title is already on screen — this
                     * is the copy that names the destination for a reader who cannot see that it
                     * is the same row.
                     */}
                    <span className="sr-only">{title}</span>
                </a>
            )}
            {/*
             * `basis-1/3` is legacy's `size={4}` of twelve. The 1px hairline is legacy's too, and it
             * is load-bearing rather than decoration: banner art is frequently light-edged, and
             * without it a pale thumbnail dissolves into the page.
             */}
            <div className="relative aspect-video w-1/3 flex-none overflow-hidden rounded-(--radius-lg) border border-(--separator-default) bg-(--background-segment)">
                {event.images.banner ? (
                    <Image
                        src={event.images.banner}
                        alt=""
                        fill
                        sizes="(max-width: 900px) 33vw, 204px"
                        className="object-cover"
                    />
                ) : (
                    // No banner is an ordinary state — the creator has not uploaded art yet.
                    <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                        <Icon name="signal-stream" weight="filled" size={20} />
                    </div>
                )}
            </div>

            {/* gap 4px, legacy's. Both text rows are single-line and truncate. */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="type-dense-strong min-w-0 truncate text-(--text-title)">{title}</p>
                {startAt && (
                    <time
                        dateTime={event.start_at ?? undefined}
                        className="type-caption-meta min-w-0 truncate text-(--text-placeholder)"
                    >
                        {startAt}
                    </time>
                )}
                {badge && (
                    // `small` is 20 tall against legacy's 22 — the DS's own step, and the two
                    // pixels are not worth a bespoke height on a chip the DS already draws.
                    <Badge size="small" status={badge.status} className="mt-0.5 w-fit">
                        {/*
                         * A breathing dot, on `LIVE` and nothing else. Every other status is a
                         * fact about the past or the schedule; this one is the only thing on the
                         * page that is true *at this moment*, and a still red chip says exactly
                         * what the grey `Ended` chip says. See `LIVE_BREATH`.
                         *
                         * `currentColor`, so it is the badge's own error accent rather than a
                         * second red that has to be kept in step with it.
                         */}
                        {event.status === 'LIVE' && (
                            <span
                                aria-hidden
                                className={cn(
                                    'size-1.5 flex-none rounded-full bg-current',
                                    LIVE_BREATH,
                                )}
                            />
                        )}
                        {t(badge.key)}
                    </Badge>
                )}
            </div>

            {/* Above the overlay link, so pressing the kebab opens the menu instead of the event. */}
            <div className="relative z-10">
                <ChannelEventMenu event={event} slug={slug} />
            </div>
        </div>
    )
}
