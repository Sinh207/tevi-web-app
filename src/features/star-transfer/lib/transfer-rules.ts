import type { TemplateRow, Transfer, TransferParty } from '../api/types'

/**
 * The rules of a transfer, as pure functions — no React, no API, no `t()`.
 *
 * Everything on this screen that decides **whether a press is allowed** or **what will actually be
 * sent** lives here, for one reason: those are the answers that must be identical between the form,
 * the review screen and the request body, and the way they stop being identical is by being computed
 * three times in three components. They are also the answers worth pinning with tests — "two lines
 * for the same Tevi ID are summed, not sent twice" is not something a comment can hold.
 *
 * The hooks keep the *state*; this file holds the *arithmetic*.
 */

/**
 * How short a Tevi ID can be before it is worth asking the backend about.
 *
 * Legacy's own threshold (`value.length > 5`), kept rather than tightened: it is a lookup, not a
 * validator, and the point of the floor is to not fire a request on every keystroke of a nine-digit
 * number. Anything at or above it gets one debounced request.
 */
export const RECEIVER_ID_MIN_LENGTH = 6

/** Legacy's note cap, and the counter under the field counts against it. */
export const MESSAGE_MAX_LENGTH = 128

/**
 * The receiver cap the review screen counts against.
 *
 * Legacy prints `{n}/10` beside the list and enforces nothing — so 10 is a number the *client* has
 * always displayed and never held anybody to, which is precisely why this screen does not enforce it
 * either (B54). Blocking on an unverified limit would refuse a transfer the backend would have
 * accepted; the count is shown so a list of eleven does not look like a list of nine.
 */
export const MAX_RECEIVERS = 10

/** 2 MB, legacy's limit. Enforced client-side so a doomed upload is refused before it is sent. */
export const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024

/**
 * Is this a Star amount that can be sent?
 *
 * ## A whole number, and decimals are **rejected** rather than rounded
 *
 * `shared/lib/money.ts` states it: Star is a count of a virtual item, and there is no such thing as
 * 3.5 Star to spend. Its formatter *rounds* a fractional figure, which is right for **displaying** a
 * number the backend sent; it would be wrong here, where the number is the one about to be taken out
 * of somebody's balance. Rounding somebody's input silently changes what they are spending — up, half
 * the time — so `3.5` is an invalid amount and the field says so.
 *
 * A leading `+`, a trailing `.`, an empty string, `Infinity` and `1e3` are all `null`: this parses the
 * **field's text**, not a number, and `Number('1e3')` being 1000 is not something a reader typing
 * into a Star field meant.
 */
export function parseStars(value: string): number | null {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return null
    return parsed
}

/** What is wrong with the amount, or `null`. `'empty'` is not an error — it is an unfilled field. */
export type AmountProblem = 'invalid' | 'insufficient' | null

export function amountProblem(value: string, balance: number | null): AmountProblem {
    if (value.trim() === '') return null
    const stars = parseStars(value)
    if (stars === null) return 'invalid'
    // `null` balance is "not known yet", not "zero". Telling somebody they cannot afford a transfer
    // because the balance request has not landed is a false accusation — `useRequireStars` makes the
    // same distinction at the press.
    if (balance !== null && stars > balance) return 'insufficient'
    return null
}

/* ============================== the CSV ============================== */

/** Why a chosen file cannot be uploaded, or `null`. */
export type FileProblem = 'too-large' | 'wrong-type' | null

/**
 * Check the file before it is sent.
 *
 * The extension **and** the MIME type are both accepted on their own, which is looser than legacy —
 * it requires both, and `file.type` for a `.csv` is `application/vnd.ms-excel` on a Windows machine
 * with Excel installed and `''` on some Linux browsers. Legacy's version therefore refuses a
 * perfectly good CSV with "Invalid file type" and leaves the reader nothing to do about it; the
 * backend validates the contents anyway, which is the check that actually matters.
 */
export function fileProblem(file: File): FileProblem {
    if (file.size > MAX_TEMPLATE_BYTES) return 'too-large'
    const name = file.name.trim().toLowerCase()
    const byExtension = name.endsWith('.csv')
    const byMime = file.type === 'text/csv' || file.type === 'application/csv'
    return byExtension || byMime ? null : 'wrong-type'
}

/** One receiver the plan will actually send to. */
export interface PlannedTransfer {
    party: TransferParty
    /** Star for this receiver — the **sum** of every line naming them. */
    stars: number
}

export interface TransferPlan {
    receivers: PlannedTransfer[]
    /** Lines that cannot be sent: rejected by the backend, unreadable, or the reader themself. */
    invalid: number
    /** Star the plan will move in total. */
    total: number
}

/**
 * Turn the backend's reading of the CSV into the list that will be sent.
 *
 * Four things happen here, and each of them is a decision:
 *
 * 1. **Lines the backend rejected are dropped and counted.** The count is what the review screen
 *    warns about; dropping them silently would let somebody confirm a transfer believing all fifteen
 *    of their lines were going out.
 * 2. **The reader's own account is dropped**, and counted as invalid rather than as a special case.
 *    Sending Star to yourself is a no-op the backend would either refuse or charge a fee for, and it
 *    is almost always a copied-in ID rather than an intention. Legacy does the same.
 * 3. **Repeated IDs are summed, not repeated.** Two lines of 100 to the same person become one
 *    receiver at 200. Sending two lines instead would be defensible right up until one of them fails
 *    and the other does not; a single figure per person is also the only version the review screen
 *    can show truthfully, since it lists people rather than lines.
 * 4. **Order is the file's**, first appearance winning. The reader is checking a list they wrote
 *    against a list on screen, so reordering it — even alphabetically — makes that check harder.
 *
 * A zero or negative amount is invalid: it is a line somebody filled in wrong, and quietly sending
 * `0` Star to them is not what they meant.
 */
export function planTransfers(rows: TemplateRow[], selfId: string | null): TransferPlan {
    const receivers: PlannedTransfer[] = []
    const seen = new Map<string, PlannedTransfer>()
    let invalid = 0

    for (const row of rows) {
        /*
         * Written as one guard per line rather than a single `unusable` boolean so the compiler can
         * narrow `row.party` for the code below — a boolean holding the null check is true to a reader
         * and opaque to TypeScript.
         */
        const party = row.party
        if (
            row.errorFields.length > 0 ||
            party === null ||
            /*
             * `isSafeInteger`, not `isFinite`, and it is the same rule `parseStars` states above: a
             * fractional amount used to pass here, so a CSV line `1002884,100.5` printed **101** on
             * the review screen (every figure goes through `formatStarAmount`, which rounds) while the
             * request body sent `100.5` — and duplicate lines compounded it into
             * `0.30000000000000004`. The screen and the body have to compute the same answer; a line
             * that cannot be shown honestly is an invalid line.
             */
            !Number.isSafeInteger(row.amount) ||
            row.amount <= 0 ||
            (selfId !== null && party.id === selfId)
        ) {
            invalid += 1
            continue
        }
        const existing = seen.get(party.id)
        if (existing) {
            existing.stars += row.amount
            continue
        }
        const planned: PlannedTransfer = { party, stars: row.amount }
        seen.set(party.id, planned)
        receivers.push(planned)
    }

    return {
        receivers,
        invalid,
        total: receivers.reduce((sum, receiver) => sum + receiver.stars, 0),
    }
}

/** Drop one receiver from a plan, keeping the total in step. */
export function withoutReceiver(plan: TransferPlan, teviId: string): TransferPlan {
    const receivers = plan.receivers.filter(receiver => receiver.party.id !== teviId)
    return {
        receivers,
        invalid: plan.invalid,
        total: receivers.reduce((sum, receiver) => sum + receiver.stars, 0),
    }
}

/**
 * The reader's own Tevi ID, as a string — the one value both flows need in order to refuse a transfer
 * to yourself.
 *
 * Takes `unknown` because it comes off `useAuth().currentUser`, which is an open record until the
 * `/me` DTO is typed (see `features/auth/lib/account-profile.ts` for the same narrowing done for the
 * same reason). The fallback is `activeId`, which *is* the user's id whenever the sign-in response
 * carried a user — but only whenever, so it is a fallback and not the source: `accountIdOf` can also
 * land on a JWT subject or a random id, and comparing a random id against a Tevi ID would silently
 * stop catching the self-transfer case.
 *
 * `null` means "not established", and every caller treats that as "do not filter" rather than as a
 * match — a wrong *match* would drop a legitimate receiver from a bulk list without saying why.
 */
export function readTeviId(value: unknown, fallback: string | null): string | null {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return fallback && fallback.trim() !== '' ? fallback.trim() : null
}

/**
 * Put the receiver back on records the write answered with.
 *
 * ## The bug this exists for
 *
 * `POST balance/transfer-star/` answers with the records it created but **does not echo `user`**, so
 * every record parsed to `party: null` — and the receipt is the screen that names the receiver. It
 * printed the *transfer ID* in the "Tevi ID" column (`PartyCard`'s fallback, meant for a history row
 * whose counterparty the payload genuinely never had) and `—` for the username. So the last screen of
 * a money flow, the one somebody keeps or screenshots, said nothing about who was paid. The PDF drew
 * the same blank, since `partyLines` reads the same field.
 *
 * The client does not need to be told: it knows exactly who it sent to — the resolved lookup on the
 * single flow, the plan's receivers on the bulk one. This is that fact being carried across the
 * response rather than re-fetched or guessed.
 *
 * ## The two rules
 *
 * 1. **The server wins where it spoke.** `transfer.party ?? known[i]` — if a payload ever does carry
 *    `user`, that is the authority and this changes nothing. Only a `null` is filled.
 * 2. **No alignment, no merge.** The lists are matched by position, and position is only meaningful
 *    when the lengths agree: `normalizeTransfers` drops a record with no timestamp (B55), and a
 *    24-row batch that comes back as 23 would otherwise shift every receiver onto the wrong amount —
 *    a receipt that names the wrong person is worse than one that names nobody. On a mismatch the
 *    records are returned untouched, and `PartyCard` falls back as before.
 *
 * Kept out of `normalizeTransfers` deliberately: that function parses *what the wire said*, and this
 * adds something the wire did not say. Mixing the two is how a parser starts inventing data.
 */
export function withKnownParties(
    transfers: Transfer[],
    known: readonly (TransferParty | null)[],
): Transfer[] {
    if (transfers.length !== known.length) return transfers
    return transfers.map((transfer, index) => {
        const party = transfer.party ?? known[index] ?? null
        return party === transfer.party ? transfer : { ...transfer, party }
    })
}
