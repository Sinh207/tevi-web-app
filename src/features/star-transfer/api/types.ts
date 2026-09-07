import { z } from 'zod'

/**
 * The three shapes `/star-transfer` reads: a **recipient**, a **transfer**, and a **CSV row**.
 *
 * ## Why every field is normalised rather than trusted
 *
 * Same posture as `features/balance/api/types.ts`, and for the same reason: this screen moves
 * somebody's Star, so the failure to design against is not a blank page but a *plausible wrong
 * number* — a fee that reads `0` because it arrived as `"0.00"` and was dropped, an amount that
 * renders `NaN`, a receipt dated January 1970 because the timestamp was in seconds.
 *
 * The coercions below (`amount`, `epochMs`, `text`, `identifier`) are deliberately **not** imported
 * from `features/balance`: `shared/` may not hold a feature's parsing rules and a barrel may not be
 * widened for a four-line transform, which is the call `features/earnings/api/types.ts` already made
 * about the same three functions. Keeping them local is also what lets this file state the one place
 * the rules differ — `stars` below is absolute where a ledger amount is signed.
 *
 * ## What is *not* modelled
 *
 * The transfer-out history is a list of **movements in the balance**, so it looks a great deal like
 * `LedgerEntry` — and `normalizeLedger` is exported for exactly that kind of reuse. It is not reused
 * here because this endpoint carries two fields that DTO does not have and this screen cannot do
 * without: the **fee** and the **counterparty**. Parsing it as a ledger entry and then re-reading the
 * raw body for the other two would be two parsers over one payload, which is how the two drift.
 *
 * Open questions on these payloads live in [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md)
 * — B54 (the receiver cap), B55 (what `POST transfer-star/` answers with) and B56 (the
 * CSV validation row's `errors`).
 */

/**
 * A Star amount. Accepts a number or a numeric string; anything else is `0`.
 *
 * Money over JSON commonly arrives as a string to avoid float drift, and on this endpoint it
 * demonstrably does: legacy strips a leading `-` off `transaction.amount` with `String.replace`,
 * which only works on a string.
 */
const amount = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed === '') return 0
            const parsed = Number(trimmed)
            return Number.isFinite(parsed) ? parsed : 0
        }
        return 0
    })
    .catch(0)

/** A trimmed string, or `''`. Never `null`, so no consumer needs a `??`. */
const text = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim() : ''))
    .catch('')

/**
 * An id, as a string. The wire sends Tevi ids as numbers in some payloads and strings in others, and
 * a screen that compares them with `===` has to be handed one of the two.
 */
const identifier = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * A timestamp, as epoch **milliseconds** — or `null`.
 *
 * Three wire shapes accepted, with the same seconds-to-milliseconds promotion
 * `features/balance` documents at length: without it a seconds feed dates every receipt to January
 * 1970 while the amounts stay right, which looks like a formatting bug and is a unit bug.
 */
const SECONDS_CUTOFF_MS = 1_000_000_000_000

const epochMs = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value <= 0) return null
            return value < SECONDS_CUTOFF_MS ? Math.round(value * 1000) : Math.round(value)
        }
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        // A bare numeric string is an epoch, not a date to parse: `Date.parse('1739923200')` is the
        // *year* 1739923200 in V8, which is not a number anybody meant.
        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed)
            if (!Number.isFinite(numeric) || numeric <= 0) return null
            return numeric < SECONDS_CUTOFF_MS ? Math.round(numeric * 1000) : Math.round(numeric)
        }
        const parsed = Date.parse(trimmed)
        return Number.isFinite(parsed) ? parsed : null
    })
    .catch(null)

/* ============================== the counterparty ============================== */

/**
 * Whoever is at the other end of a transfer — looked up by Tevi ID, or carried on a history row.
 *
 * The wire fields are legacy's (`display_name`, and an avatar **object** rather than a URL), which is
 * the contract until the `/me` DTO is typed — see `features/auth/lib/account-profile.ts`, which
 * narrows the same two fields for the stored-account case. A flat `avatar` string is accepted too, so
 * a backend that flattens the field one day blanks no faces.
 */
const partySchema = z.looseObject({
    id: identifier,
    display_name: text,
    /*
     * `.optional()` and not a bare `z.unknown()`: in zod 4 an `unknown` key is still **required to be
     * present**, so a payload that simply omits the avatar would fail the whole object and take the
     * name and the id down with it. The field is read by `avatarUrl` below, which handles `undefined`
     * on its own.
     */
    avatar: z.unknown().optional(),
})

export interface TransferParty {
    /** The Tevi ID, as a string. `''` if the payload carried none, which drops the row. */
    id: string
    /** May be `''` — a row with no name still has an ID, and the ID is what was typed. */
    name: string
    /**
     * `null` for the placeholder avatar.
     *
     * The still only. `avatar_video` is deliberately **not** carried: an animated avatar is
     * Premium-only and this feature draws every face with `isPremium={false}` — a clip looping inside
     * a money dialog is the wrong thing for the screen to spend attention on (see `TransferParty`).
     * Modelling a field nothing may render would be an invitation to render it.
     */
    avatarUrl: string | null
}

/** `{ thumb }`, or a bare URL, or nothing. Same three cases `accountAvatarUrl` handles. */
function avatarUrl(value: unknown): string | null {
    if (value && typeof value === 'object') {
        const thumb = (value as Record<string, unknown>).thumb
        return typeof thumb === 'string' && thumb.trim() !== '' ? thumb.trim() : null
    }
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toParty(raw: z.infer<typeof partySchema>): TransferParty {
    return {
        id: raw.id,
        name: raw.display_name,
        avatarUrl: avatarUrl(raw.avatar),
    }
}

/**
 * Parse `GET auth/v1/users/{id}/`.
 *
 * `null` when the body carries no id, because an id is the whole point of the lookup: the field the
 * reader typed is only "valid" if it resolved to somebody the transfer can be addressed to. A 404 is
 * handled a level up, in the model.
 */
export function normalizeParty(body: unknown): TransferParty | null {
    const parsed = partySchema.safeParse(body)
    if (!parsed.success) return null
    const party = toParty(parsed.data)
    return party.id === '' ? null : party
}

/* ============================== a transfer ============================== */

const transferSchema = z.looseObject({
    id: identifier,
    amount,
    fee: amount,
    description: text,
    created_at: epochMs,
    /** Optional for the reason `partySchema`'s avatar is — an absent key must not fail the row. */
    user: z.unknown().optional(),
})

/**
 * One completed transfer — a row of the history, and an element of what the write answers with.
 *
 * One shape for both because they *are* both: `POST transfer-star/` answers with the records it just
 * created, which is what lets the receipt print a real transfer ID rather than "submitted". B55 asks
 * the backend to confirm that; if it turns out to answer with something else, this is the one place
 * that changes.
 */
export interface Transfer {
    /** The transfer ID — shown on the receipt and copyable from a history row. */
    id: string
    /**
     * Star moved, **absolute**.
     *
     * A ledger amount is signed and must stay signed (a refund is a real row); this list is
     * transfers *out* only, so the sign carries nothing a screen reads — and legacy strips it at
     * every one of its four render sites. Taking it off here means no view does `Math.abs`, and no
     * view forgets to.
     */
    stars: number
    /** What the platform charged for it. `0` today at every call site, and shown as a real figure. */
    fee: number
    /** The sender's own note. `''` when they wrote none — the receipt omits the row. */
    description: string
    /** Epoch **milliseconds**. */
    createdAt: number
    /** The receiver. `null` when the payload carried no user — the row still shows amount and time. */
    party: TransferParty | null
}

function toTransfer(raw: z.infer<typeof transferSchema>, createdAt: number): Transfer {
    const party = partySchema.safeParse(raw.user)
    const parsed = party.success ? toParty(party.data) : null
    return {
        id: raw.id,
        stars: Math.abs(raw.amount),
        fee: Math.abs(raw.fee),
        description: raw.description,
        createdAt,
        party: parsed && parsed.id !== '' ? parsed : null,
    }
}

/**
 * Parse a page of `GET billy/v5/billing/transfer-out-history/`, or the array `POST transfer-star/`
 * answers with.
 *
 * Accepts the array under `results` or bare, for the reason `normalizeLedger` accepts both: cheap
 * now, versus a list that silently empties the day the envelope moves.
 *
 * **A row with no readable timestamp is dropped**, like a ledger row: it cannot be dated, grouped or
 * printed on a receipt, and a transfer whose time is unknown is not a transfer anybody can ask
 * support about. Rows are **not** re-sorted — the list is paginated, so sorting would order the
 * twenty rows that happened to arrive together and produce a list that is locally ordered and
 * globally not.
 */
export function normalizeTransfers(body: unknown): Transfer[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: Transfer[] = []
    for (const row of rows) {
        const parsed = transferSchema.safeParse(row)
        if (!parsed.success) continue
        if (parsed.data.created_at === null) continue
        out.push(toTransfer(parsed.data, parsed.data.created_at))
    }
    return out
}

/* ============================== a CSV row ============================== */

const templateRowSchema = z.looseObject({
    amount,
    /**
     * `.optional()`, for the reason `partySchema.avatar` above spells out and this field got wrong: in
     * zod 4 a bare `z.unknown()` is still **required to be present**, so a rejected line that carries
     * no `user` at all (`{ amount: 500, errors: { user: 'not found' } }`) failed the whole parse and
     * was dropped by the loop below — *uncounted*, so the review screen warned about nothing and
     * "12 of your 15 lines were unusable" silently became "we found 12 lines".
     */
    user: z.unknown().optional(),
    /**
     * Legacy tests it with `Object.keys(item.errors).length`, i.e. an **object** keyed by field name.
     * A list is accepted too — see `errorFields` below, which must not read one as "no errors". What
     * the keys and values are is B56; nothing here reads them, because a per-field message the
     * backend wrote in one language is not something this screen can put in front of a reader in nine.
     */
    errors: z.unknown().optional(),
})

/** One line of the uploaded CSV, as the backend read it. */
export interface TemplateRow {
    party: TransferParty | null
    amount: number
    /** The field names the backend rejected. Empty ⇒ the row is usable. */
    errorFields: string[]
}

/**
 * The field names the backend rejected — and, for a list-shaped payload, a stand-in name per entry.
 *
 * ## An array must never read as "no errors"
 *
 * This used to be `!Array.isArray(errors) ? Object.keys(errors) : []`, which **failed open on a money
 * path**: DRF-style per-row errors (`{ errors: ['Receiver is blocked'] }`) produced an empty list, so
 * `planTransfers` treated the line as usable, counted it in the total, and posted Star for a line the
 * backend had just said it rejected. Legacy's `Object.keys(item.errors).length` rejects an array
 * (`Object.keys(['x']).length === 1`), so the old reading was also a behaviour change.
 *
 * The names themselves are never rendered (B56 — nobody has confirmed what they are, and a message
 * the backend wrote in one language cannot be shown to a reader in nine); only whether there are any.
 */
function errorFieldsOf(errors: unknown): string[] {
    if (Array.isArray(errors)) return errors.map((_, index) => String(index))
    if (errors && typeof errors === 'object') return Object.keys(errors)
    return []
}

/**
 * Parse `POST billy/v5/billing/balance/transfer-star/template/validation/`.
 *
 * Every row is kept, valid or not — the count of rejected rows is what the review screen warns
 * about, so dropping them here would silently turn "12 of your 15 lines were unusable" into "we
 * found 12 lines". Which of them are usable is decided by `planTransfers`, not here, because that
 * decision needs the reader's own account id and this parser has no business knowing it.
 */
export function normalizeTemplateRows(body: unknown): TemplateRow[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: TemplateRow[] = []
    for (const row of rows) {
        const parsed = templateRowSchema.safeParse(row)
        if (!parsed.success) continue
        const party = partySchema.safeParse(parsed.data.user)
        const resolved = party.success ? toParty(party.data) : null
        out.push({
            party: resolved && resolved.id !== '' ? resolved : null,
            amount: parsed.data.amount,
            errorFields: errorFieldsOf(parsed.data.errors),
        })
    }
    return out
}

/**
 * One line of the write: who gets how much, and the note that goes with it.
 *
 * ⚠ **`description` is required on the wire and may be empty — `string`, never optional.** It was
 * `description?: string`, sent as `undefined` when the sender wrote no note, and `JSON.stringify`
 * drops an undefined-valued key: the request went out without the field and billy answered
 *
 * ```json
 * { "success": false, "message": "This field is required.",
 *   "errors": [{ "input": "description", "code": "required", "index": 0 }] }
 * ```
 *
 * so **every transfer with a blank note failed** — the one path a reader is most likely to take.
 * Legacy sends its textarea state straight through (`description: messages`), which is `''` when
 * empty and has shipped that way for years, so an empty string is accepted; what the backend
 * refuses is the *absent key*. Optional here, required there is the whole class of bug that the
 * types cannot catch, hence the non-optional field: a caller that means "no note" has to say `''`.
 */
export interface TransferRequest {
    user_id: string
    amount: number
    description: string
}
