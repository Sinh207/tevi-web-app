import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { payoutRequestOutcome } from './payout-request-errors'

/**
 * The 4xx vocabulary of `POST payout-request/`, which the OpenAPI schema does not document — it lists
 * `201` and nothing else. So this pins what the client *decides*, and it is the only place that decision
 * is stated: a wrong branch here is a reader stuck at a verification wall being shown a toast.
 */
const err = (params: {
    status?: number
    code?: string
    data?: unknown
    isCanceled?: boolean
    isNetwork?: boolean
}) =>
    new ApiError({
        message: `Request failed with status code ${params.status ?? 500}`,
        status: params.status,
        code: params.code,
        data: params.data,
        isCanceled: params.isCanceled,
        isNetwork: params.isNetwork,
    })

describe('payoutRequestOutcome — verification', () => {
    /**
     * The branch that matters most. Legacy's one structured 4xx: 422 with
     * `identification_level_2_required`, which is **not** an error but an unfinished step. Reported as a
     * message it leaves somebody with nothing to press.
     */
    it('routes the identity wall rather than reporting it', () => {
        expect(
            payoutRequestOutcome(
                err({ status: 422, data: { code: 'identification_level_2_required' } }),
            ),
        ).toEqual({ kind: 'verification-required' })
    })

    /** Case-insensitively, and from `ApiError.code` as well as the body. */
    it('matches the code however it arrives', () => {
        expect(
            payoutRequestOutcome(err({ status: 422, code: 'IDENTIFICATION_LEVEL_2_REQUIRED' }))
                .kind,
        ).toBe('verification-required')
        expect(
            payoutRequestOutcome(err({ status: 422, data: { data: { code: 'kyc_required' } } }))
                .kind,
        ).toBe('verification-required')
    })

    /**
     * The wall wins over the status: it has been seen as 403 as well as 422, and a verification prompt
     * shown as a toast because of a status code is the failure this module exists to prevent.
     */
    it('does not depend on the status being 422', () => {
        expect(
            payoutRequestOutcome(
                err({ status: 403, data: { code: 'identification_level_2_required' } }),
            ).kind,
        ).toBe('verification-required')
    })
})

describe('payoutRequestOutcome — the amount', () => {
    it('puts a limit verdict on the field, with the backend sentence', () => {
        const outcome = payoutRequestOutcome(
            err({
                status: 422,
                data: { code: 'daily_limit_exceeded', message: 'Daily limit exceeded' },
            }),
        )
        expect(outcome).toEqual({ kind: 'amount-rejected', message: 'Daily limit exceeded' })
    })

    /**
     * `insufficient_balance` is a statement about the number that was typed, so it belongs on the field
     * beside it — the fix is the same as for a limit: type a smaller one.
     */
    it('treats an insufficient balance as an amount verdict', () => {
        expect(payoutRequestOutcome(err({ status: 422, code: 'insufficient_balance' })).kind).toBe(
            'amount-rejected',
        )
    })

    /**
     * A **400 with no recognised code** still goes to the field: on this endpoint the amount is the only
     * free-form thing the reader controls, since the config and the option are both picked from lists
     * the server supplied.
     */
    it('sends an uncoded 400 to the field', () => {
        const outcome = payoutRequestOutcome(
            err({ status: 400, data: { message: 'Amount must be at least 10' } }),
        )
        expect(outcome).toEqual({ kind: 'amount-rejected', message: 'Amount must be at least 10' })
    })

    /**
     * An uncoded **422** does not. Legacy's only structured 422 is the verification wall, so an
     * unrecognised one is more likely a state problem — and a message on the amount field would send
     * somebody editing a number that is fine.
     */
    it('leaves an uncoded 422 as unknown', () => {
        expect(payoutRequestOutcome(err({ status: 422, data: { message: 'Nope' } }))).toEqual({
            kind: 'unknown',
            message: 'Nope',
        })
    })
})

describe('payoutRequestOutcome — two-step verification', () => {
    /**
     * The branch that makes the screen usable for an account with a passcode. Reached when `/me` was
     * cached before two-step verification was switched on elsewhere — so the request went without a
     * code. Reported as a message it is a dead end; as an outcome the passcode dialog opens.
     */
    it('asks for the passcode rather than reporting a failure', () => {
        for (const code of [
            'passcode_required',
            'two_fa_required',
            'two_fa_passcode_required',
            'invalid_passcode',
        ]) {
            expect(payoutRequestOutcome(err({ status: 422, code })).kind).toBe('passcode-required')
        }
    })

    /** With the backend's own sentence when it sent one — the dialog shows it as the reason it re-opened. */
    it('carries the backend sentence', () => {
        expect(
            payoutRequestOutcome(
                err({
                    status: 422,
                    data: { code: 'passcode_required', message: 'Passcode is required' },
                }),
            ),
        ).toEqual({ kind: 'passcode-required', message: 'Passcode is required' })
    })

    /**
     * **It must not land on the amount field**, which is what a bare 400 does. The figure is fine; a
     * message under it sends somebody editing a number that was never the problem.
     */
    it('beats the uncoded-400 rule', () => {
        expect(payoutRequestOutcome(err({ status: 400, code: 'passcode_required' })).kind).toBe(
            'passcode-required',
        )
    })

    /**
     * **Deliberately narrow.** These spellings are inferred — the schema documents no 4xx here — so the
     * set holds nothing generic. A guess that fired on `forbidden` would put a passcode prompt in front
     * of every unrelated refusal, which is worse than the generic message it replaced.
     */
    it('does not fire on a generic refusal', () => {
        for (const code of [
            'forbidden',
            'permission_denied',
            'invalid_request',
            'validation_error',
        ]) {
            expect(payoutRequestOutcome(err({ status: 403, code })).kind).not.toBe(
                'passcode-required',
            )
        }
    })
})

describe('payoutRequestOutcome — the quote', () => {
    /** Nobody did anything wrong, so the screen re-quotes rather than reporting a failure. */
    it('marks a stale quote as recoverable', () => {
        for (const code of ['quote_expired', 'quote_invalid', 'quote_not_found']) {
            expect(payoutRequestOutcome(err({ status: 422, code })).kind).toBe('quote-expired')
        }
    })
})

describe('payoutRequestOutcome — what must never reach the reader', () => {
    /**
     * Axios's own wording. `error.message` is `"Request failed with status code 422"` on every one of
     * these, and putting that on a money screen is worse than saying nothing — the same rule
     * `providerSignInErrorText` follows in `features/auth`.
     */
    it('never shows the transport message', () => {
        const outcome = payoutRequestOutcome(err({ status: 409 }))
        expect(outcome.kind).toBe('unknown')
        expect((outcome as { message: string | null }).message).toBeNull()
    })

    /** A 5xx body is where stack fragments and proxy HTML live. */
    it('withholds a 5xx body', () => {
        const outcome = payoutRequestOutcome(
            err({ status: 502, data: { message: '<html>502 Bad Gateway</html>' } }),
        )
        expect(outcome).toEqual({ kind: 'unknown', message: null })
    })

    /** A validation object stringified into a sentence is not a sentence. */
    it('withholds a message that is not one short sentence', () => {
        const outcome = payoutRequestOutcome(
            err({ status: 400, data: { message: 'x'.repeat(400) } }),
        )
        expect(outcome).toEqual({ kind: 'amount-rejected', message: null })
    })

    /**
     * An abort is the reader navigating away, or the component unmounting. It must raise **nothing** —
     * a toast for a request the reader themselves ended is a bug that only shows on a fast click.
     */
    it('says nothing about an aborted request', () => {
        expect(payoutRequestOutcome(err({ isCanceled: true, code: 'ERR_CANCELED' }))).toEqual({
            kind: 'unknown',
            message: null,
        })
    })

    /** A dead network has no body and no status. */
    it('handles a network failure', () => {
        expect(payoutRequestOutcome(err({ isNetwork: true }))).toEqual({
            kind: 'unknown',
            message: null,
        })
    })

    /** Something that is not an `ApiError` at all — a thrown string, a TypeError from a bad parse. */
    it('handles a non-ApiError', () => {
        expect(payoutRequestOutcome(new Error('boom'))).toEqual({ kind: 'unknown', message: null })
        expect(payoutRequestOutcome('boom')).toEqual({ kind: 'unknown', message: null })
        expect(payoutRequestOutcome(undefined)).toEqual({ kind: 'unknown', message: null })
    })
})
