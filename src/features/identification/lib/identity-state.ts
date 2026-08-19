import {
    IDENTITY_LEVEL,
    type IdentificationSubmission,
    type SubmissionsResponse,
} from '../api/types'

/**
 * What the screen shows, derived from the submission list.
 *
 *   unverified  nothing has been submitted, or the last attempt is over and did not pass
 *   pending     a submission exists and Sumsub has not finished with it
 *   verified    an approved LEVEL_2 submission — withdrawals are unlocked
 */
export type IdentityState = 'unverified' | 'pending' | 'verified'

/**
 * The statuses that mean "still in Sumsub's hands".
 *
 * Sumsub's own vocabulary is larger than this and the backend re-spells it, so the list is
 * what we have actually seen plus the obvious synonyms — see `docs/BACKEND_QUESTIONS.md`
 * (B22). It is a **closed** list on purpose: anything unrecognised falls through to
 * `unverified`, which shows the intro and lets the person start again. The opposite default
 * would strand someone on a "waiting for approval" screen with no way off it, because a
 * status we do not know is far more likely to be a terminal failure spelled unfamiliarly
 * (`RETRY`, `ON_HOLD_FINAL`, `DECLINED`) than a new kind of waiting.
 *
 * Relaunching the flow is safe in either case: the WebSDK reads the applicant's real state
 * from Sumsub and shows its own status screen when there is nothing left to submit.
 */
const PENDING_STATUSES = new Set([
    'PENDING',
    'PROCESSING',
    'SUBMITTED',
    'QUEUED',
    'AWAITING_REVIEW',
    'ON_HOLD',
])

const APPROVED = 'APPROVED'

/** Case- and whitespace-insensitive: the backend has shipped both casings of `level`. */
function normalize(value: string | null | undefined): string {
    return (value ?? '').trim().toUpperCase()
}

/**
 * Only LEVEL_2 counts.
 *
 * Legacy checks the same thing (`components/content/index.js`): LEVEL_1 is a lighter check
 * that does not unlock withdrawals, so an approved LEVEL_1 must not read as "verified".
 */
function isIdentityLevel(submission: IdentificationSubmission): boolean {
    return normalize(submission.level) === IDENTITY_LEVEL
}

/**
 * Fold the submission list into the one thing the UI branches on.
 *
 * Approval wins over everything else: a person who has been verified and then started a
 * second submission is verified. `undefined` (still loading, or the request failed) folds to
 * `unverified` — the intro is the screen that offers a way forward, and a failed fetch must
 * not silently claim someone is verified when they are not.
 */
export function toIdentityState(
    submissions: IdentificationSubmission[] | null | undefined,
): IdentityState {
    if (!submissions?.length) return 'unverified'

    const identity = submissions.filter(isIdentityLevel)
    if (identity.some(s => normalize(s.status) === APPROVED)) return 'verified'
    if (identity.some(s => PENDING_STATUSES.has(normalize(s.status)))) return 'pending'
    return 'unverified'
}

/**
 * The rows out of a paginated response, defensively.
 *
 * Legacy treats an empty or malformed body as "no submissions" rather than an error
 * (`providers/authentication/index.js` throws internally and then sets `[]`), and so does
 * this: the screen it produces — the intro — is correct either way.
 */
export function toSubmissions(response: SubmissionsResponse | null | undefined) {
    return Array.isArray(response?.results) ? response.results : []
}
