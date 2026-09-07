import { z } from 'zod'

/**
 * A creator's **direct donation** offer — `billy/v1/gifting/direct-donate/{slug}/`.
 *
 * One offer per space, not a catalogue: the creator picks a metaphor ("a coffee", "a pizza") and a
 * unit price, and a visitor buys some number of them. That is why there is no list endpoint and no
 * id in any URL here — the slug selects the offer, because the space *has* one or has none.
 *
 * ## `null` is the answer for "this creator does not take donations"
 *
 * The endpoint 404s (or answers a body this file cannot read) for a space with no offer, and roughly
 * half of all spaces have none. So the model resolves to `DirectDonate | null` and the query treats
 * both as success — the same contract `channelApi.getMyChannel` states, and for the same reason: a
 * missing offer is not a failure, and rendering an error where the honest answer is "there is no
 * Donate button here" would put a retry prompt on every second channel page.
 *
 * ## Parsed per field, never thrown
 *
 * Same rule as `features/channel/api/types.ts`: a `.catch()` per field, so one renamed key degrades
 * one row instead of taking the space page's About tab down. Unknown fields are kept (`looseObject`)
 * — the cash path this client does not implement yet ships more keys than these, and dropping them
 * here would make them invisible to whoever wires it up.
 */

/**
 * The four metaphors the backend ships art for.
 *
 * Kept as a closed set **only for choosing the artwork** — an unknown value renders the fallback
 * glyph rather than nothing, because the offer is still real and still buyable. Legacy indexes
 * `ICON_DONATION_OPTIONS[icon]` with no guard, so a fifth value there is a broken image in four
 * places at once.
 */
export const DONATION_ICONS = ['coffee', 'pizza', 'book', 'rose'] as const
export type DonationIcon = (typeof DONATION_ICONS)[number]

/** A string that is present and non-blank, else `null`. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/**
 * A money amount that may arrive as a number **or** as a decimal string.
 *
 * `prices[].amount` is `"100.00"` on the wire today and `donation_count` is a bare number, and the
 * two come from the same service — so neither is evidence for the other. Both go through this.
 * A value that is not finite becomes `0`, which every caller already has to handle: an offer with
 * no usable price is one the button must not open.
 */
const numeric = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value !== 'string') return 0
        const parsed = Number.parseFloat(value.trim())
        return Number.isFinite(parsed) ? parsed : 0
    })
    .catch(0)

const boolish = z.coerce.boolean().catch(false)

/**
 * One price line. The offer carries one per currency — `TVS` (Star) and `USD` — and the client
 * picks by currency rather than by position, because the order is not guaranteed and legacy's
 * `findIndex` over `amount_currency` is the only thing that has ever selected them.
 */
export const donationPriceSchema = z.looseObject({
    id: nullableText,
    amount: numeric,
    /** Upper-cased here so no call site has to remember the wire is inconsistent about it. */
    amount_currency: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : null))
        .catch(null),
})

export type DonationPrice = z.infer<typeof donationPriceSchema>

export const directDonateSchema = z.looseObject({
    /** The unit's name — "Coffee", "Pizza". Shown in the dialog title and the confirm sentence. */
    name: nullableText,
    /** Chooses the artwork. `null` when the backend sends something this client has no art for. */
    icon: z
        .unknown()
        .transform(v => {
            const value = typeof v === 'string' ? v.trim().toLowerCase() : ''
            return (DONATION_ICONS as readonly string[]).includes(value)
                ? (value as DonationIcon)
                : null
        })
        .catch(null),
    /**
     * The creator's own wording for the button ("Buy me a coffee").
     *
     * **Untranslated by nature**, and shown verbatim when present. This is the same narrow exception
     * `signInErrorText` documents in `features/auth`: no key of ours can say what a creator wrote,
     * so the alternative to showing their sentence is showing a generic one that is less true.
     * Legacy tries to reverse-map it onto a translation key by comparing it against every string in
     * the English bundle (`useHelper.handleKey`), which silently mistranslates any creator who
     * happened to type "Donate" and does nothing for everyone else.
     */
    button_text: nullableText,
    /** The creator's own thank-you line. Rendered as **text**, never as HTML — see the success dialog. */
    thank_you_msg: nullableText,
    /** Whether the creator publishes how many donations they have received. */
    display_supporter_count: boolish,
    donation_count: numeric,
    prices: z
        .array(z.unknown())
        .catch([])
        .transform(rows =>
            rows
                .map(row => donationPriceSchema.safeParse(row))
                .filter(r => r.success)
                .map(r => r.data),
        ),
})

export type DirectDonate = z.infer<typeof directDonateSchema>

/**
 * The space a donation is aimed at, as **this** feature needs it.
 *
 * Deliberately not `features/channel`'s `Channel`. Donations are offered from the space page today
 * and from a post, a live room and a message tomorrow, and none of those should have to construct a
 * channel to open the dialog. More immediately: `features/channel` imports this feature's barrel, so
 * importing its barrel back would be a cycle between two features — the exact thing
 * `channel-owner-actions.tsx` already had to unpick once (see its note on `@features/earnings/routes`).
 *
 * `slug` is the only field the write needs; the rest are what the dialogs say out loud.
 */
export interface DonationTarget {
    slug: string
    name: string | null
    /**
     * The channel's **id**, which only the card path needs: `checkout/v3/checkout/donation/` takes
     * `channel_id`, while the Star path posts to the slug's own endpoint. Legacy sends both from its
     * one dialog for the same reason.
     *
     * Optional, because a target assembled where the id is not to hand (a post, a message) can still
     * open the Star half — and `isCashAvailable` reads it, so the cash tab is simply not offered there
     * rather than offering a button that would 400.
     */
    id?: string | null
    /**
     * The creator's picture, badged onto the dialog's illustration tile.
     *
     * A donation is made **to a person**, and the dialog said so only in words — the tile showed a
     * coffee and nothing else, so the screen could have belonged to any creator on the platform.
     * Optional because a target assembled somewhere without one (a post, a message) should not have
     * to invent it; the tile falls back to the unit art alone.
     */
    avatarUrl?: string | null
    /** Copied by the support card's share button. `null` hides it. */
    shareUrl?: string | null
}

/** `null` when the body is not an offer this client can read — see the file's note. */
export function normalizeDirectDonate(body: unknown): DirectDonate | null {
    if (!body || typeof body !== 'object') return null
    const parsed = directDonateSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}
