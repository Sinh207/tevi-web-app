import type { BadgeStatus } from '@shared/ui/badge'
import type { EventStatus } from '../api/types'

/**
 * What an event's `status` **says**, and what it **means**.
 *
 * Two different questions, and legacy answers them with two different vocabularies for the same six
 * values — which is why they are both here rather than one being derived from the other:
 *
 * | wire | the creator's list (`ms_live_detail_w2_*`) | the event's own page (`live_status_w2_*`) |
 * |---|---|---|
 * | `LIVE` | Live | **Happening now** |
 * | `PUBLISHED` | Coming soon | Coming soon |
 * | `PREPARING` | Preparing | **Live preparing** |
 * | `PAUSED` | Paused | **Live paused** |
 * | `ENDED` | Ended | **Live ended** |
 * | `CANCELLED` | Cancelled | **Live cancelled** |
 *
 * `features/channel`'s event card ports the left column (`channel_event_*`). This file is the right
 * one — the label over a page whose entire subject is that one stream, where "Live" on its own reads
 * as a category and "Happening now" reads as a fact. Both are legacy's own strings; neither was
 * invented here.
 */

/**
 * The chip's label key and DS role.
 *
 * ## The colours are the DS's tinted pairs, not legacy's six fills
 *
 * Legacy paints white on `#E41F37` / `#007aff` / `#ff7c00` / `#559588` / `#501bc0`. The measurement
 * that rules that out is written up on `features/channel`'s `channel-event-card.tsx`: white on those
 * fills fails WCAG 1.4.3 at this size, and pinning a foreground to white while the background token
 * inverts between modes made one of them *white on white*. `Badge` pairs a tinted ground with the
 * matching accent ink so both halves move together.
 *
 * The role mapping is that file's too, deliberately — the same status must not be a different colour
 * on the card and on the page it links to. `outline` for `CANCELLED` rather than `disabled` is the
 * one non-obvious choice, and the reason is measured: `disabled` is 1.34:1 in light, which is right
 * for a control nobody may press and wrong for a label somebody has to read.
 */
const STATUS_CHIP: Record<EventStatus, { key: string; status: BadgeStatus }> = {
    LIVE: { key: 'event_status_happening_now', status: 'error' },
    PUBLISHED: { key: 'event_status_coming_soon', status: 'warning' },
    PREPARING: { key: 'event_status_preparing', status: 'info' },
    PAUSED: { key: 'event_status_paused', status: 'warning' },
    ENDED: { key: 'event_status_ended', status: 'default' },
    CANCELLED: { key: 'event_status_cancelled', status: 'outline' },
}

/**
 * The chip for a status, or `null`.
 *
 * `null` for an unrecognised or absent value, and it renders **nothing** rather than an empty chip —
 * legacy's `default` branch returns `{ label: '', color: '' }`, which paints a transparent pill with
 * no text in it.
 */
export function eventStatusChip(
    status: string | null,
): { key: string; status: BadgeStatus } | null {
    if (!status) return null
    return STATUS_CHIP[status as EventStatus] ?? null
}

/** On air *now* — the only status that is a claim about this moment. */
export function isLive(status: string | null): boolean {
    return status === 'LIVE'
}

/**
 * The stream is **not on air and will not come back on its own** — or is between segments.
 *
 * `PAUSED` is in here, and it is legacy's grouping rather than an assumption:
 * `['CANCELLED', 'ENDED', 'PAUSED'].includes(status)` is its own `isEnded`. A paused stream is not
 * playing, so a page that offered to play it would be lying — but it is also not *over*, which is
 * why callers get the status back rather than a boolean and the copy can differ.
 */
export function isOffAir(status: string | null): boolean {
    return status === 'ENDED' || status === 'CANCELLED' || status === 'PAUSED'
}

/** Scheduled, or being set up — it has not started yet. */
export function isUpcoming(status: string | null): boolean {
    return status === 'PUBLISHED' || status === 'PREPARING'
}

/**
 * How long after `ended_at` a viewer still sees the live view rather than the details page.
 *
 * Legacy's five minutes (`endedAt + 5 * 60 * 1000 >= now`), and the reason it exists is worth
 * keeping: somebody who was **watching** when the stream stopped must land on "the broadcast has
 * ended" and not be silently swapped onto a details page, which reads as the stream having never
 * happened.
 */
export const RECENTLY_ENDED_MS = 5 * 60 * 1000

/**
 * Did this stream come off air within the last five minutes?
 *
 * `now` is a parameter rather than a `Date.now()` call, for the reason every date predicate in this
 * repo takes one: a function that reads the clock cannot be tested for the boundary, and this one's
 * boundary is the whole behaviour. It also keeps the answer stable across a render — reading the
 * clock twice in one pass can put two components on opposite sides of the window.
 *
 * ⚠ **Not called during a server render.** The answer changes every second, so a cached HTML page
 * would serve a stale verdict; the caller mounts on the client and re-reads it there.
 */
export function isRecentlyEnded(endedAt: string | null, now: number): boolean {
    if (!endedAt) return false
    const at = new Date(endedAt).getTime()
    if (Number.isNaN(at)) return false
    // `at > now` is the clock-skew case: a device a minute behind the server would otherwise read a
    // just-ended stream as ended long ago. Anything in the future is "just now".
    return at > now || now - at <= RECENTLY_ENDED_MS
}
