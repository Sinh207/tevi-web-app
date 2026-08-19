import { z } from 'zod'

/**
 * What this account is *allowed to do* — the wire shape of `permission/v3/channel/permission/`
 * and the parsing that turns it into something a gate can be built on.
 *
 * ## What this endpoint actually is
 *
 * Not roles, not scopes, not a JWT claim set. It is a **bag of feature grants keyed by feature
 * name**, each granted per account by the backoffice, each with its own ad-hoc shape and its own
 * spelling of "yes":
 *
 * ```jsonc
 * {
 *   "transfer_star": { "allowed": true },              // ← `allowed`
 *   "fiat_agency":  { "is_active": true, "name": "…", "payout_method": [ … ] }  // ← `is_active`
 * }
 * ```
 *
 * Two features, two different boolean field names, and the second one smuggles a whole
 * configuration object in beside its flag. That is the contract as legacy consumes it
 * (`providers/permission`, `containers/starTransfer`, `containers/payout`), and it is the reason
 * this feature exists as a feature rather than as one more field on `/me`: **the payload is
 * open-ended and will grow**, so the client needs one place that knows how to read a grant and one
 * vocabulary the rest of the app gates on (`lib/capabilities.ts`), instead of thirty call sites each
 * reaching into `channelPermission?.some_feature?.some_flag`.
 *
 * Legacy has exactly that problem in miniature already: `Boolean(channelPermission?.fiat_agency?.is_active)`
 * is written out by hand in four files, and one of them (`containers/payout/index.js`) forgets the
 * `Boolean()` and passes `undefined` where a boolean is expected.
 *
 * ## Why every grant is normalised to a real boolean
 *
 * Because the failure to design against here is not a blank screen — it is **an entitlement decided
 * by a typo**. `is_active: "false"` (a string) is truthy. A renamed field reads as `undefined`, which
 * is falsy, which is the safe direction; a *retyped* one is not. So each flag goes through
 * `strictBoolean` below, which accepts `true` and nothing else that could be mistaken for it.
 *
 * The direction is deliberate and it is the opposite of the money parsers in
 * `features/balance/api/types.ts`. There, an unreadable amount becomes `0` so arithmetic stays safe.
 * Here, an unreadable grant becomes **`false`** — the payout screen and the star-transfer screen are
 * both money-moving surfaces, and showing them to somebody the backend did not grant them to is a
 * worse outcome than hiding them from somebody who has them (who will open a support ticket, which
 * is recoverable).
 *
 * See `docs/BACKEND_QUESTIONS.md` B40–B42 for what is still guessed at.
 */

/**
 * `true`, and only `true`.
 *
 * Not `Boolean(value)`: `"false"`, `"0"`, `{}` and `[]` are all truthy in JS and any of them can
 * arrive from a backend that changed a column type. A grant is a yes/no answer about what somebody
 * may do with money, so the one shape that means yes is the boolean `true`.
 *
 * `1` is accepted alongside it because a MySQL `TINYINT(1)` serialised without a cast is the one
 * other spelling of yes that shows up in practice on this platform — and it is unambiguous, unlike
 * the strings.
 */
const strictBoolean = z
    .unknown()
    .transform(value => value === true || value === 1)
    .catch(false)

/** A trimmed string, or `''` when absent — never `undefined`, so no consumer needs `?? ''`. */
const text = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim() : ''))
    .catch('')

/**
 * A fee figure. Accepts a number or a numeric string, like every other money field on this platform
 * (see `features/balance/api/types.ts` on why money arrives as strings), and is `0` when unreadable.
 *
 * `0` rather than `null` here for a specific reason: these are the **editable** values on the payout
 * settings form, and a `null` in a controlled number input is a React warning plus an uncontrolled
 * field. Legacy already writes `method.transaction_fee_rate || 0` at every use.
 */
const fee = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value === 'string') {
            const parsed = Number(value.trim())
            return Number.isFinite(parsed) ? parsed : 0
        }
        return 0
    })
    .catch(0)

/* ============================== fiat agency ============================== */

const payoutMethodSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String).catch(''),
    name: text,
    currency: text,
    is_active: strictBoolean,
    transaction_fee_rate: fee,
    transaction_fee_fixed_amount: fee,
})

/**
 * One payout channel an agency offers — "Bank Transfer", "E-Wallet" — with the agency's own cut.
 *
 * The id is stringified because it is used as a React key and as an identity in the settings form's
 * `map`, and legacy compares it with `===` against values that come back from both a `<Radio value>`
 * (always a string) and the payload (a number). That mismatch is the bug where toggling one method
 * silently toggles none.
 */
export interface PayoutMethod {
    /** Stringified, and never empty: a row without one is dropped. See `normalizeChannelPermission`. */
    id: string
    /** The backend's own label; screens run it through `t()` with itself as the fallback. */
    name: string
    /** Upper-case-agnostic; displayed next to the name. `''` when absent. */
    currency: string
    /** Whether the agency offers this method to its creators right now. */
    isActive: boolean
    /** The agency's commission, as a rate. */
    feeRate: number
    /** The agency's commission, as a flat amount per transaction. */
    feeFixed: number
}

/**
 * The **fiat agency** grant: this account is a payout agency, i.e. it settles other creators'
 * withdrawals and takes a cut.
 *
 * It is the one grant that carries configuration rather than just permission, and that is worth
 * stating because it invites a mistake: the payout *screen* must not treat this as its source of
 * truth. It is a snapshot from a permission check — legacy reads `payout_method` from it to seed the
 * settings form and then immediately re-fetches `payout/agency-info/`, precisely because the two can
 * disagree after a save. Use it to *gate*, and to render an instant first paint; read the agency
 * endpoint for the values you are about to write back.
 */
export interface FiatAgency {
    /** Whether the agency is switched on. The gate. */
    isActive: boolean
    /** The agency's display name — read-only on the settings form. */
    name: string
    /** The methods it offers. Empty when the payload had none; never `undefined`. */
    payoutMethods: PayoutMethod[]
}

/* ============================== the payload ============================== */

/**
 * `looseObject`, so an unknown grant is *carried*, not dropped.
 *
 * That is the whole point of parsing this payload rather than typing it: the backoffice will add
 * grants, and the client should not have to ship to see them. `lib/capabilities.ts` reads unknown
 * grants through `rawGrant`, so a new backend feature can be gated the day it appears — one line in
 * the capability registry, no schema change.
 */
const channelPermissionSchema = z.looseObject({
    transfer_star: z.looseObject({ allowed: strictBoolean }).catch({ allowed: false }),
    fiat_agency: z
        .looseObject({
            is_active: strictBoolean,
            name: text,
            payout_method: z.array(z.unknown()).catch([]),
        })
        .catch({ is_active: false, name: '', payout_method: [] }),
})

/**
 * Everything this account may do, as the app talks about it.
 *
 * `raw` is kept deliberately — see `rawGrant` in `lib/capabilities.ts`. Everything else is a named,
 * normalised grant, and a *named* grant is one that has a screen behind it in this codebase.
 */
export interface ChannelPermission {
    /**
     * Star Transfer — moving Star to another account. Granted to partners and agencies, not to
     * ordinary creators, which is why the whole `/star-transfer` screen is behind it.
     */
    canTransferStar: boolean
    /** The payout-agency grant and its configuration. `isActive` is the gate. */
    fiatAgency: FiatAgency
    /**
     * The payload **as it arrived**, for grants this client has no name for yet.
     *
     * Deliberately the original body rather than the parsed object: the schema below fills in
     * defaults for the two named grants, so a parsed `{}` carries a `transfer_star` key the wire
     * never sent. Anything enumerating this — "which grants does this account have?" — would then be
     * reading the client's own defaults back as facts.
     *
     * Not for feature code to read directly: go through `can()` on the provider, which is where the
     * spelling of a grant is written down once. This exists so adding a capability does not require
     * touching the schema.
     */
    raw: Record<string, unknown>
}

/**
 * Parse `v3/channel/permission/`.
 *
 * Total: it never throws and never returns `null`, because a *partial* answer is normal here — the
 * payload only carries the grants an account actually has, so an ordinary creator's response is
 * `{}` and that is not an error. Every absent grant reads as denied, which is what an ordinary
 * creator's grants are.
 *
 * That is also why the provider tracks whether the answer *arrived* separately (`isKnown`) rather
 * than inferring it from the content: `{}` and "the request failed" both produce all-false here, and
 * only one of them means "this account is not an agency". Legacy conflates them, and the visible
 * result is `/star-transfer` rendering **Access denied** to an agency whose permission request hit a
 * 502 — see `providers/permission-provider.tsx`.
 */
export function normalizeChannelPermission(body: unknown): ChannelPermission {
    const parsed = channelPermissionSchema.safeParse(body)
    const data = parsed.success ? parsed.data : null

    return {
        canTransferStar: data?.transfer_star?.allowed === true,
        fiatAgency: {
            isActive: data?.fiat_agency?.is_active === true,
            name: data?.fiat_agency?.name ?? '',
            payoutMethods: (data?.fiat_agency?.payout_method ?? []).flatMap(row => {
                const method = payoutMethodSchema.safeParse(row)
                if (!method.success) return []
                /*
                 * No id, no row. It is the identity the settings form toggles and saves by
                 * (`method.id === methodId`), so an id-less row is not editable — and *two* of them
                 * are worse than useless: both match `'' === ''`, so toggling one toggles both and
                 * the save sends two entries the backend cannot place. Same rule, same reason, as
                 * `normalizeLedger` dropping a row with no timestamp.
                 */
                if (!method.data.id) return []
                return [
                    {
                        id: method.data.id,
                        name: method.data.name,
                        currency: method.data.currency,
                        isActive: method.data.is_active,
                        feeRate: method.data.transaction_fee_rate,
                        feeFixed: method.data.transaction_fee_fixed_amount,
                    },
                ]
            }),
        },
        /*
         * The body, not `data` — see the note on `ChannelPermission.raw`. Arrays are excluded as well
         * as non-objects: `typeof [] === 'object'`, and an array of grants is not a shape this
         * endpoint has ever sent.
         */
        raw:
            body && typeof body === 'object' && !Array.isArray(body)
                ? (body as Record<string, unknown>)
                : {},
    }
}
