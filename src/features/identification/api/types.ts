/**
 * Identity verification — what the backend says about an account's KYC submissions.
 *
 * The payloads are **not** fully specified anywhere we control: `/identification/submissions/`
 * mirrors Sumsub's applicant state, and legacy only ever read two fields off it (`level` and
 * `status`) to answer one question — "is this account verified?". So these interfaces describe
 * only the fields the app reads, and describe them as optional and as plain `string`: every
 * one is normalised through `lib/identity-state.ts` rather than trusted as a literal union. A
 * status we have never seen must not become a runtime crash or, worse, a false "verified".
 * Extra fields the backend sends are simply not modelled — nothing here reads them.
 *
 * See `docs/BACKEND_QUESTIONS.md` (B22) for what is still guessed at here.
 */

/**
 * Sumsub verification levels, as legacy names them
 * (`containers/identification/constant/index.js`).
 *
 * Only `LEVEL_2` is ever requested — it is the ID + selfie flow that unlocks withdrawals.
 * `LEVEL_1` exists in the backend's vocabulary and is listed so the type is the real one,
 * not a one-value alias.
 *
 * ⚠ **The casing is unsettled.** Legacy sends `LEVEL_2` and is in production, so that is what
 * goes out here. The auth contract writes every level lowercase (`level_2`), both in
 * `sumsub/request/`'s body and in what `identification/levels/` returns. Reading is safe either
 * way — `identity-state.ts` upper-cases before it compares — but the *write* can only be one of
 * them, and a wrongly-cased level is plausibly a 400 rather than a silent miss. Do not flip it
 * on the contract's word alone; it is the open half of B22.
 */
export type SumsubLevel = 'LEVEL_1' | 'LEVEL_2'

/** The level this screen asks for. Legacy passes exactly this, from both call sites. */
export const IDENTITY_LEVEL: SumsubLevel = 'LEVEL_2'

/**
 * One row of `/identification/submissions/`. Everything is optional — see the note above.
 *
 * ✅ The real row is `{ level, status, submitted_at, approved_at, rejected_at, rejected_reason,
 * data }` (auth contract, B22). The three timestamps are **epoch seconds**, not the ISO strings
 * this interface used to declare as `created_at` / `updated_at` — two fields the endpoint has
 * never sent. Nothing read them, so nothing broke; they are gone rather than renamed, because
 * modelling a field no screen shows is how the next reader comes to trust it.
 *
 * `rejected_reason` is the one addition worth having: it is the only thing that can say *why* a
 * submission failed, and today the screen sends people back through Sumsub without it.
 */
export interface IdentificationSubmission {
    level?: string | null
    status?: string | null
    /** Epoch **seconds**, like every timestamp on this endpoint. */
    submitted_at?: number | null
    approved_at?: number | null
    rejected_at?: number | null
    /** Free text from review. Nothing renders it yet — see B22. */
    rejected_reason?: string | null
}

/** DRF's paginated envelope, after the API client has unwrapped `{ data: … }`. */
export interface SubmissionsResponse {
    results?: IdentificationSubmission[] | null
    count?: number | null
    next?: string | null
}

/**
 * The answer to `POST /identification/sumsub/request/`.
 *
 * A short-lived Sumsub access token. It is not a Tevi credential and never goes near the
 * token store: it is handed straight to the WebSDK, which exchanges it for its own session
 * and asks for a fresh one when it expires.
 */
export interface SumsubSession {
    sumsub_access_token?: string | null
}
