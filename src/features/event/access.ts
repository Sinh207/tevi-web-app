/**
 * **Is a live stream gated, and how does it say so** — the whole rule, in one import-free module.
 *
 * ## Why it is at the feature root and imports nothing
 *
 * The four sanctioned narrow barrels in `CLAUDE.md` exist so a cheap consumer does not pay for a
 * whole feature, and this is the same shape as `routes.ts`: **two features need this rule and
 * neither may reach into the other's internals.**
 *
 * - `features/event` renders the stream's own page, and the paywall is most of what that page has to say.
 * - `features/channel` renders every surface that *advertises* a stream — the space's Live tab card,
 *   the Live-now strip, the Following row — and each of those draws the same badge.
 *
 * It lived in `features/channel/lib/live-access.ts` until the event page became real, which was
 * correct only for as long as the channel was the sole reader. Two copies of a rule that decides
 * whether somebody is asked for money is the failure this move prevents: they diverge silently, and
 * the visible half is a price tag on a free stream (see the bug documented on `liveAccess` below,
 * which is exactly that class of mistake made once already, upstream).
 *
 * So: `@features/event/access`, never `@features/event`. The main barrel pulls in the screen, the
 * dialogs, `@features/membership` and `@features/balance`; a card that wants three predicates must
 * not pay for any of it — and, more sharply, `features/channel` importing the main barrel would
 * close a cycle the day the event page needs anything of the channel's.
 *
 * ## Structural parameters, not a DTO
 *
 * Every function takes the **fields it reads** rather than an event type, which is what lets one
 * rule serve two schemas: `features/channel`'s `channelEventSchema` (the `v4/events/` list row) and
 * this feature's `eventDetailSchema` (the `v4/public/events/{code}/` payload) are two services'
 * wire formats and neither is evidence for the other's. Both satisfy these shapes, and `tsc` is
 * what checks that at each call site — so a field renamed in either schema is a type error here
 * rather than a predicate quietly reading `undefined`.
 */

/** The four fields that decide whether a reader is invited to unlock. */
export interface GateFields {
    /** A decimal string (`"3.00"`) in `price_currency`. `null` means *unpriced*, not free. */
    price: string | null
    /** Memberships that unlock this stream. Only the **length** is read. */
    required_packages: string[]
    /** The backend's own verdict on whether *this reader* is locked out. */
    need_unlock_package: boolean
    /** This reader has already paid for it outright. */
    purchased: boolean
}

/** The one field that decides whether **the website** may play a stream at all. */
export interface PlatformFields {
    /** Platform names this stream may **not** be watched on — `["Website"]` on a real payload. */
    restricted_platforms: string[]
}

/** The two app-associated URLs, in the order they are preferred. */
export interface AppLinkFields {
    /** The short form — `https://tevi.com/e/{code}/`. */
    public_url: string | null
    /** The canonical share URL — `https://tevi.com/@{slug}/event/{code}/`. */
    shareable_url: string | null
}

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
export function liveAccess(event: GateFields): LiveAccess | null {
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
export function isPlatformRestricted(event: PlatformFields): boolean {
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
export function appLink(event: AppLinkFields): string | null {
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
export function isExclusiveLive(event: Pick<GateFields, 'price' | 'required_packages'>): boolean {
    if (event.required_packages.length > 0) return true
    const raw = event.price === null ? null : Number(event.price)
    return raw !== null && Number.isFinite(raw) && raw > 0
}
