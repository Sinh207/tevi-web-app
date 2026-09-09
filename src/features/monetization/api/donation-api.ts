import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import type { DonationRange } from '../lib/donation-setting'
import {
    type DonationSetting,
    type DonationSummary,
    normalizeDonationSetting,
    normalizeDonationSummary,
    normalizeDonations,
    type ParsedDonationPage,
} from './donation-types'

/**
 * The creator's **direct-donation** dashboard — `billy/v4/billing/donation/**`.
 *
 * **Billy**, like every other money surface in this feature, and **v4**, which is what legacy calls.
 * The donation half of billy's schema is byte-identical in v5, so there is nothing to gain by moving
 * and one contract to re-verify; when the rest of the app moves, this moves with it.
 *
 * Four endpoints, and legacy's model declares a fifth:
 *
 * | | |
 * |---|---|
 * | `GET setting/` | the offer this creator publishes — **404 means they publish none** |
 * | `POST setting/` | create it |
 * | `PATCH setting/` | edit it |
 * | `GET summary/` | `unique_supporter_count` for a date range |
 * | `GET donations/` | who has donated, in that range |
 *
 * ## Three things legacy declares and never calls, all deliberately absent
 *
 * - **`DELETE setting/`** exists on the wire and in legacy's `DonationModel`, and `useDonation`
 *   even wraps it as `handleDeleteSetting` — but **no component calls it**: the settings menu has
 *   two rows, Share and Donation settings. It is not ported, because *"Activate Donation"* is
 *   already the off switch a creator reaches for and a second, irreversible one is a product
 *   decision nobody has made. `web-app` is the spec, and the spec has no Delete.
 * - **`GET metadata/`** is declared in the same model, called from nowhere, and the schema gives it
 *   no response body at all. There is nothing to port.
 * - **`allow_monthly_donation` / `allow_post_donation`** are real fields on the setting and no
 *   client has ever set either. Kept by `looseObject` so they survive a round trip, never written.
 *
 * ## No `id` in any URL, and everything is derived from the bearer
 *
 * The path is the offer: a creator has one setting or none, so `setting/` selects it the way
 * `direct-donate/{slug}/` selects the buyer's view of the same thing. The two consequences
 * `membership-api.ts` writes down hold here unchanged — every request must **pin the account**, and
 * being signed in *is* the whole gate because there is no URL to check against.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

const VERSION = 'v4'

/**
 * Query keys.
 *
 * **Account-scoped, and it is not optional** — this is one creator's offer and the people who paid
 * it, and the account switcher is two taps from every screen. The overview keys carry the range as
 * well, so switching back to a range already fetched is served from cache and an in-flight request
 * for the old range cannot resolve into the new view.
 */
const DONATION_SCOPE = ['monetization', 'donation'] as const

export const creatorDonationKeys = {
    /** The whole creator-donation area — what a write to the setting invalidates. */
    all: DONATION_SCOPE,
    setting: (accountId: string | null) =>
        [...DONATION_SCOPE, 'setting', accountId ?? 'anon'] as const,
    /** Every range of the overview — the prefix a setting write invalidates. */
    overviewAll: [...DONATION_SCOPE, 'overview'] as const,
    summary: (accountId: string | null, range: DonationRange) =>
        [...DONATION_SCOPE, 'overview', 'summary', accountId ?? 'anon', range] as const,
    donations: (accountId: string | null, range: DonationRange) =>
        [...DONATION_SCOPE, 'overview', 'donations', accountId ?? 'anon', range] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

function scope({ accountId, signal }: Scoped) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

/**
 * What the setup form writes.
 *
 * One price per currency, which is the shape legacy posts and the shape the schema types
 * (`Price.amount` is `format: decimal`, i.e. a **string**). `name` and `icon` are both sent and both
 * carry the unit — legacy's own payload, and the schema does not say they may differ.
 */
export interface DonationSettingPayload {
    name: string
    icon: string
    button_text: string
    thank_you_msg: string
    display_supporter_count: boolean
    is_active: boolean
    prices: { amount: string; amount_currency: string }[]
}

export const creatorDonationApi = {
    /**
     * The creator's offer, or `null` when they publish none.
     *
     * **A 404 is an answer, not a failure.** Swallowing it here rather than at the hook is what
     * makes the contract `DonationSetting | null` for every consumer — the query resolves `success`,
     * raises no toast, enters no error state, and `isPending` goes false. `donationApi.getOffer` and
     * `channelApi.getMyChannel` state the same thing at more length.
     *
     * Any other status is left to reject, and that distinction is the whole screen: legacy's
     * `initSetting` treats *every* non-200 as "no donation setting", so one 502 shows a creator with
     * paying supporters the intro wall inviting them to switch the feature on.
     */
    async getSetting(rest: Scoped = {}): Promise<DonationSetting | null> {
        try {
            const body = await api.get<unknown>(
                `${VERSION}/billing/donation/setting/`,
                undefined,
                scope(rest),
            )
            return normalizeDonationSetting(body)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    async createSetting({
        payload,
        ...rest
    }: Scoped & { payload: DonationSettingPayload }): Promise<DonationSetting | null> {
        const body = await api.post<unknown>(
            `${VERSION}/billing/donation/setting/`,
            payload,
            scope(rest),
        )
        return normalizeDonationSetting(body)
    },

    /**
     * **`PATCH`, not `PUT`** — legacy's call, and the schema's: the endpoint offers
     * `PatchedMyDonationSetting` and no `PUT` at all. The form still sends every field it owns, so
     * the two would differ only in what happens to the fields it does *not* own — and those are
     * `allow_monthly_donation` and `allow_post_donation`, which no client sets and a whole-object
     * write would therefore silently reset.
     */
    async updateSetting({
        payload,
        ...rest
    }: Scoped & { payload: DonationSettingPayload }): Promise<DonationSetting | null> {
        const body = await api.patch<unknown>(
            `${VERSION}/billing/donation/setting/`,
            payload,
            scope(rest),
        )
        return normalizeDonationSetting(body)
    },

    /**
     * The one figure above the list. `null` when the body is unreadable — the card then falls back
     * to the donations `count` rather than printing a made-up zero.
     */
    async getSummary({
        range,
        ...rest
    }: Scoped & { range: DonationRange }): Promise<DonationSummary | null> {
        const body = await api.get<unknown>(
            `${VERSION}/billing/donation/summary/`,
            { date_range: range },
            scope(rest),
        )
        return normalizeDonationSummary(body)
    },

    /**
     * The donations received in a range.
     *
     * **Unpaged, which is legacy's behaviour and the schema's.** `donations/` documents exactly one
     * query parameter — `date_range` — and legacy renders `results` whole with no scroll handler. So
     * a creator with more supporters than one page sees the first page and no way to reach the rest;
     * that is a real limit of both clients and **B104** asks for the paging parameters rather than
     * this file guessing `page` / `page_size` at them. The envelope's `count` is already read, so the
     * day they are answered the list has its total in hand.
     */
    async getDonations({
        range,
        ...rest
    }: Scoped & { range: DonationRange }): Promise<ParsedDonationPage> {
        const body = await api.get<unknown>(
            `${VERSION}/billing/donation/donations/`,
            { date_range: range },
            scope(rest),
        )
        return normalizeDonations(body)
    },
}
