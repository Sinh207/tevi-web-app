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
 */
export type SumsubLevel = 'LEVEL_1' | 'LEVEL_2'

/** The level this screen asks for. Legacy passes exactly this, from both call sites. */
export const IDENTITY_LEVEL: SumsubLevel = 'LEVEL_2'

/** One row of `/identification/submissions/`. Everything is optional — see the note above. */
export interface IdentificationSubmission {
    level?: string | null
    status?: string | null
    created_at?: string | null
    updated_at?: string | null
}

/** DRF's paginated envelope, after the API client has unwrapped `{ data: … }`. */
export interface SubmissionsResponse {
    results?: IdentificationSubmission[] | null
    count?: number | null
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
