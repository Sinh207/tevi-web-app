/**
 * `Feb 23, 2023 - 17:00` — the appeal queue's row timestamp, as the comps draw it.
 *
 * ## Why not `formatLedgerDateTime`
 *
 * `shared/lib/ledger-time.ts` renders the same two parts and joins them with **`Intl`'s own
 * separator**, which in `en` is a comma. The comps join with a spaced hyphen, and that separator is
 * visible enough that copying the ledger's output would read as a different design. So the two
 * halves are formatted separately — each still in the reader's locale, each still in their own zone
 * — and joined here.
 *
 * Deliberately not a fourth thing in `shared/`: one screen wants this, and the moment a second one
 * does, this moves down beside `formatLedgerDateTime` rather than being copied.
 *
 * The **hour cycle is the locale's**, not the comps'. Figma shows `17:00` because it is drawn in a
 * 24-hour locale; forcing `h23` on `en-US` would print a time no American reads that way, which is
 * the sort of "matching the mock" that makes an app feel translated rather than localised.
 *
 * `''` for anything unparseable, so the caller drops the line rather than printing `Invalid Date`.
 */
export function formatFlaggedPostDate(iso: string | null | undefined, locale = 'en'): string {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    try {
        const day = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(date)
        const time = new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
        }).format(date)
        return `${day} - ${time}`
    } catch {
        return ''
    }
}

/**
 * `12:02` — a video's length, over its thumbnail.
 *
 * Seconds in, because that is the only shape a duration is ever sent in that is not ambiguous. Hours
 * are carried when there are any (`1:02:03`), which the comps do not show and a long upload needs.
 *
 * ⚠ **Nothing calls this with a real value yet.** The captured `nsfw-posts/` payload has `video:
 * null` on every row, so the field holding a duration is the one thing B96 still does not know. It
 * is written now, with its test, so that wiring it is one line rather than a second decision about
 * how a duration is spelled.
 */
export function formatDuration(seconds: number | null | undefined): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return ''
    const total = Math.floor(seconds)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
