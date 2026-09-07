import type { ChannelEvent } from '../api/events-api'

/** What the badge over a stream's banner says, or `null` when the stream is simply open. */
export interface LiveAccess {
    /** Translation key for the label. */
    key: 'channel_live_members_only' | 'channel_live_unlock_for' | 'channel_live_members_or'
    /** The Star figure the label interpolates, already a number. `null` for members-only. */
    price: number | null
}

/**
 * Whether a live stream is gated, and how it says so.
 *
 * Legacy's home card decides this from three fields and phrases it three ways:
 *
 * | required packages | priced | label |
 * |---|---|---|
 * | yes | yes | "Become members or N ⭐" — either route unlocks it |
 * | yes | no  | "Members only" |
 * | no  | yes | "Unlock for N ⭐" |
 *
 * ## The case legacy gets wrong, and it is the common one
 *
 * Its free check is `Boolean(price && parseInt(price, 10) <= 0)`, so a **missing** `price` is not
 * free — it is falsy, `isFree` is `false`, and `isExclusive` (`!isFree || …`) becomes `true`. An
 * ordinary open stream whose payload omits the field is therefore labelled **"Unlock for 0 ⭐"**:
 * a price tag on something that costs nothing, printed over the creator's own banner.
 *
 * Here `null` price means *unpriced*, which with no required packages means **no badge at all**.
 * Only a price above zero produces a figure.
 *
 * ## `purchased` and `need_unlock_package` are read, and legacy does not read them here
 *
 * A reader who has already paid, or who holds the membership, is not shown what it costs — the
 * badge is an invitation, and showing it to somebody already inside is the same mistake as offering
 * "Become a member" to somebody who just paid. Legacy uses both fields on the *event page* and
 * neither on the card, so its home feed advertises a price to people who own the thing.
 *
 * `need_unlock_package` is the backend's own verdict and is trusted over the local arithmetic when
 * it says the reader is **not** locked out — but only to drop the *invitation* down to a statement,
 * never to erase the badge. See the branch itself.
 */
export function liveAccess(event: ChannelEvent): LiveAccess | null {
    const requiresMembership = event.required_packages.length > 0
    // `Number`, not `parseInt`: "3.50" must not become 3. `null` stays null — unpriced is a state.
    const raw = event.price === null ? null : Number(event.price)
    const price = raw !== null && Number.isFinite(raw) && raw > 0 ? raw : null

    // Nothing to unlock and nothing to pay: an open stream.
    if (!requiresMembership && price === null) return null

    /*
     * ## Two reader-relative flags, and **neither of them can erase a membership**
     *
     * `purchased` and `need_unlock_package` both describe *this reader*, not the stream. They used to
     * short-circuit to `null`, and the result was reported from a real card: a creator looking at
     * their own members-only broadcast, chip reading *Exclusive*, banner blank.
     *
     * The split that fixes it is invitation versus statement. "Become members or N ★" solicits, and
     * soliciting somebody who is already in — or who has already paid — is wrong. "Members only"
     * *describes*, and it stays true for every viewer, so a members-only stream always says so.
     *
     * `purchased` is checked **after** the membership test, not before, and that ordering is the
     * whole fix for the reported case: a creator's own stream can come back `purchased: true`, and
     * checked first that erased the badge on a stream that is still members-only. What `purchased`
     * legitimately suppresses is a **price** — a stream somebody bought outright is theirs, and a
     * figure on it would be a second bill.
     */
    if (requiresMembership) {
        const locked = event.need_unlock_package && !event.purchased
        if (locked && price !== null) return { key: 'channel_live_members_or', price }
        return { key: 'channel_live_members_only', price: null }
    }

    if (event.purchased) return null

    return { key: 'channel_live_unlock_for', price }
}

/**
 * Is this stream barred from **the website**?
 *
 * `restricted_platforms` is a list of platform names; `"Website"` is ours. Compared case-insensitively
 * because a wire value that decides whether somebody can watch is not worth losing to a capital
 * letter — the same defensiveness `status` gets.
 *
 * What legacy does with it: the *event page* refuses to play and shows a `PlatformRestricted` panel.
 * What it does **not** do is filter its lists, so the stream is still advertised and the reader finds
 * out one tap later. This client keeps the card — the space really is live, and hiding it would be a
 * different lie — but answers the tap with the same message legacy's page shows, before navigating
 * somewhere that cannot play it. Whether it should be advertised at all is B74.
 */
export function isPlatformRestricted(event: ChannelEvent): boolean {
    return event.restricted_platforms.some(platform => platform.toLowerCase() === 'website')
}

/**
 * Where "Open in Tevi App" points: the stream's own URL on an app-associated domain.
 *
 * `public_url` (`/e/{code}/`) first, then `shareable_url` — both are `tevi.com`, which iOS and
 * Android associate with the app, so following one from a phone opens the app rather than the page.
 * `null` when the payload carried neither, which is the one case the button cannot be drawn.
 *
 * This is deliberately **not** an AppsFlyer OneLink. Legacy builds one (`useDynamicLink` →
 * `useAppsFlyer` → PostHog → remote config) and this app dropped that chain with `GetAppButton`,
 * where the note explains why: the link is populated by a tracking-gated effect, so an early press
 * silently does nothing.
 */
export function appLink(event: ChannelEvent): string | null {
    return event.public_url ?? event.shareable_url
}

/**
 * Is this stream **gated at all** — priced, or behind a membership?
 *
 * ## Why this is not `liveAccess() !== null`
 *
 * They look like the same question and they are not, and getting them confused labels a paid
 * stream "Free" for exactly the readers who paid for it.
 *
 * `liveAccess` answers **"should this reader be invited to unlock?"** — so it deliberately returns
 * `null` for somebody who has already `purchased` the stream, and for somebody whose membership the
 * backend has confirmed (`need_unlock_package === false`). Neither of those makes the stream free;
 * they make the invitation unnecessary.
 *
 * This answers **"is it exclusive?"**, which is a property of the *stream* and identical for every
 * viewer. So it reads only the two fields that describe the stream itself and ignores the two that
 * describe the reader.
 *
 * Legacy's Following chip computes exactly this — `(price && parseInt(price) > 0) ||
 * required_packages.length > 0` — and, unlike its home card, gets it right: a payload with no
 * `price` falls through to `false` and reads Free. The bug `liveAccess` documents is in the *other*
 * call site, which is why this is a second function rather than a reuse of that one.
 *
 * `Number`, not `parseInt`, for the reason `liveAccess` gives: `"3.50"` must not become 3. A price
 * of `"0"` is not a gate.
 */
export function isExclusiveLive(event: ChannelEvent): boolean {
    if (event.required_packages.length > 0) return true
    const raw = event.price === null ? null : Number(event.price)
    return raw !== null && Number.isFinite(raw) && raw > 0
}
