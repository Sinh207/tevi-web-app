import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/** Auth microservice, same base as `authApi`: `${W_API}/auth`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/auth` })

/**
 * **Two-step verification** — the account passcode that stands in front of a withdrawal.
 *
 * Its own model rather than four more methods on `authApi`, which is legacy's own split
 * (`models/twoFa.js` beside `models/apiAuth.js`) and the right one here: `authApi` is about
 * *becoming* somebody, and this is about an account already signed in re-proving itself before one
 * specific action. Nothing in the sign-in path touches it.
 *
 * ## All eight of legacy's endpoints, in two halves — and the split is not arbitrary
 *
 * Legacy's model has eight: `GET/POST/PATCH/DELETE v1/two-fa/passcode/`, `recover/`, `reset/`,
 * `reset/verify-otp/` and `verify/`. Those are two features wearing one coat, and the line between
 * them is **who is proving what**:
 *
 * 1. **Presenting or recovering a passcode you already have** — `verify/`, and the three-call
 *    recovery chain `recover/` → `reset/verify-otp/` → `reset/`. All four are implemented here,
 *    because all four are needed to get *this* account past *this* withdrawal: without the recovery
 *    chain, a creator who has forgotten their passcode cannot withdraw at all.
 * 2. **Managing** the passcode — `POST` to create a first one, `PATCH` to change it, `DELETE` to
 *    remove it, `GET` to read its hint. Those are a two-step-verification **settings** screen, and
 *    that screen now exists: `/settings/two-step-verification` (`TwoFaSettings`). All eight are
 *    therefore implemented — the split above is still the right one to read the file by, because the
 *    two halves have different callers, different failure vocabularies and different re-auth rules
 *    (a management write is only offered *after* `verify/` has passed in the same session).
 *
 * ⚠ **The management half is the guessed half.** `verify/` and the recovery chain were confirmed
 * against legacy's one live call site; nothing in this repo has ever called the other four, legacy's
 * web app never calls them either (its eight-method model has exactly one consumer, the withdrawal
 * dialog), and the schema documents none of them. Their payloads below are read off legacy's JSDoc
 * and its mobile app's copy. **B92** is the open question, bullet by bullet — read it before
 * "fixing" one of these bodies.
 *
 * ⚠ `reset/` is used here to **replace** a forgotten passcode, which is the only thing legacy uses
 * it for too — reached solely by way of an emailed OTP. It is not a general "set my passcode" call
 * and must not be reused as one: it takes the `otp` as its authority, so a caller without one has
 * nothing to send.
 *
 * ## The schema documents none of this
 *
 * `two-fa/` does not appear in the OpenAPI schema at all, so the contract is legacy's source plus a
 * probe of the live gateway (signed, no bearer):
 *
 * - `GET v1/two-fa/passcode/verify/` → **405 Method Not Allowed** — the route exists and is POST-only.
 * - `POST v1/two-fa/passcode/verify/` → **401 `{ code: "no_auth_token", … }`** — it is behind the
 *   bearer, and its errors put `code` at the **top level**, which is the spelling
 *   `payout-request-errors.ts` reads first.
 *
 * All four routes of the *first* half answer that same 401 unauthenticated, so all four exist.
 * Everything else — payload field names, which statuses mean what — is read off `models/twoFa.js`. What the endpoints answer
 * for a *wrong* code is the one thing neither source settles: legacy branches on 422, so that is
 * what `toPasscodeErrorKey` is written against, and it maps every 4xx the same way rather than
 * trusting one status.
 */
export const twoFaApi = {
    /**
     * Prove the passcode — `POST v1/two-fa/passcode/verify/`.
     *
     * Legacy sends `{ passcode, passcode_hint }` on this call (its JSDoc lists both) but passes only
     * `{ passcode: code }` from the one call site. **Only `passcode` goes**, matching the call site
     * rather than the comment: `passcode_hint` is something you *set*, and offering the backend a
     * hint while asking it to check a code is at best ignored and at worst a way to overwrite one.
     *
     * **Rejects on a wrong code.** Legacy reads `res?.status === 200` off a model that resolves for
     * every status, so its 422 branch is a `then`; this client's axios rejects, so the caller catches
     * — and `toPasscodeErrorKey` is what turns that into a sentence. No message from the body ever
     * reaches the screen.
     *
     * `accountId` pins the bearer, for `authApi.updateMe`'s reason and more sharply: this call is the
     * gate on a withdrawal, so verifying as whoever happens to be active when the request goes out
     * would let a passcode proved on one account authorise a request sent as another.
     */
    verifyPasscode(passcode: string, accountId?: string | null, signal?: AbortSignal) {
        return api.post<unknown>(
            'v1/two-fa/passcode/verify/',
            { passcode },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Send the recovery code — `POST v1/two-fa/passcode/recover/`.
     *
     * **No body at all**, matching legacy (`ApiAuthModel.post(VERSION + '/two-fa/passcode/recover/')`).
     * The destination is the account's recovery email, which the backend holds, so the client does not
     * send it.
     *
     * ## It answers with the address, and that is worth printing
     *
     * Confirmed by the API team. Legacy ignores the response entirely and its copy says "your recovery
     * email address" — which leaves somebody with two addresses, or one they have not used in a year,
     * checking the wrong inbox and pressing Resend at a code that did arrive. So the address comes back
     * and the step names it.
     *
     * **Parsed loosely and never required.** The spelling is read three ways (`recovery_email`, plain
     * `email`, and either nested under `data`) because none of them is in a schema, and a miss must
     * degrade to legacy's generic sentence rather than to a blank where an address should be. It is
     * *display only* — nothing is authorised or addressed on it.
     */
    async recoverPasscode(accountId?: string | null, signal?: AbortSignal): Promise<string | null> {
        const body = await api.post<unknown>(
            'v1/two-fa/passcode/recover/',
            {},
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return recoveryEmailOf(body)
    },

    /**
     * Check the emailed code — `POST v1/two-fa/passcode/reset/verify-otp/`.
     *
     * A **separate** step from `resetPasscode` below even though the reset re-presents the same
     * `otp`, and legacy is right to split it: without this call the reader would type a code, then
     * choose a new passcode twice, then write a hint, and only then be told the code was wrong —
     * with the new passcode discarded. Verifying early is what makes the three steps after it safe
     * to spend effort on.
     *
     * ⚠ It is *not* an authorisation, and the client holds no token from it. The `otp` is the
     * authority and it has to be carried through to `reset/`.
     */
    verifyResetOtp(otp: string, accountId?: string | null, signal?: AbortSignal) {
        return api.post<unknown>(
            'v1/two-fa/passcode/reset/verify-otp/',
            { otp },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Replace a forgotten passcode — `POST v1/two-fa/passcode/reset/`.
     *
     * Three fields, and all three go every time: `passcode`, `passcode_hint`, `otp`. The hint is sent
     * as **`''`** when the reader skipped it rather than omitted, because that is legacy's *Skip*
     * (`handleSkipHint` posts `passcode_hint: ''`) and because an omitted field on a write that
     * *replaces* a record is how a previous hint survives a reset it should not have survived.
     *
     * That is the opposite call from `createRequest`'s omitted `passcode` in `features/payout`, and
     * deliberately: there, absent means "this account has no passcode" and `''` would be a value the
     * server has to reject. Here, `''` means "no hint", which is a value.
     *
     * **Never retried**, like every write in this file: `client.ts` will not replay a POST without
     * `{ retry: true }`. A replayed reset would spend an OTP the reader cannot re-obtain without
     * another email.
     */
    resetPasscode(
        payload: { passcode: string; passcodeHint: string; otp: string },
        accountId?: string | null,
        signal?: AbortSignal,
    ) {
        return api.post<unknown>(
            'v1/two-fa/passcode/reset/',
            {
                passcode: payload.passcode,
                passcode_hint: payload.passcodeHint,
                otp: payload.otp,
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * What the account's passcode record says about itself — `GET v1/two-fa/passcode/`.
     *
     * The **only read** in the file, and the only one of the eight that is not a write. It exists for
     * one reason: the *hint* the account wrote when it set the passcode up, which is worth nothing
     * stored and everything shown at the moment six empty boxes are asked for.
     *
     * ## It is never the authority on whether the feature is on
     *
     * `/me`'s `two_fa_passcode` is (`accountTwoFaPasscode`), and this call is detail on top. That is
     * deliberate and it is what keeps the settings screen honest: `/me` is already in the query cache
     * when the page mounts, so the screen knows on/off with no request and renders the right branch on
     * the first paint — where keying the branch off this call would mean a skeleton, and then the
     * *wrong* branch for anyone whose 404 or 502 the client mis-read. A failure here costs a hint.
     *
     * ✅ **The shape is confirmed**: `{ passcode_hint, recovery_email }`, both nullable — and the
     * address comes back **masked** (`u**r@gmail.com`). It is parsed loosely all the same, because a
     * body this client cannot read must degrade to `{ hint: null, recoveryEmail: null }` rather than
     * to an error.
     *
     * ⚠ **Masked means it can be shown and never compared.** A read-back that checked the stored
     * address against what the reader typed would fail on every success — and it must never be
     * pre-filled into an editable field, or the reader submits the asterisks.
     *
     * **An account with no passcode gets `422 AU002`, not a 404.** `useTwoFaPasscode` reads both as
     * "no record".
     */
    async getPasscode(
        accountId?: string | null,
        signal?: AbortSignal,
    ): Promise<TwoFaPasscodeRecord> {
        const body = await api.get<unknown>('v1/two-fa/passcode/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
        })
        return passcodeRecordOf(body)
    },

    /**
     * Turn two-step verification **on** — `POST v1/two-fa/passcode/`.
     *
     * Four fields, all four in one call, and that is what shapes the whole setup flow: legacy's
     * JSDoc gives `{ passcode, passcode_hint, recovery_email, otp }`, so the passcode, the hint, the
     * recovery address *and* a code proving that address are collected before anything is sent. Hence
     * the write is the last thing the flow does — the reader is five screens in when it fires, which
     * is why `useTwoFaSetup` clears nothing on a failure that a resend can fix.
     *
     * **`passcode_hint` is sent as `''` when skipped**, not omitted, for `resetPasscode`'s reason: an
     * absent field on a call that *creates* a record is how a hint arrives as `null` where the reader
     * chose "no hint", and the two are not the same value to a backend that later prints it.
     *
     * ✅ **The `otp` comes from `sendRecoveryEmailOtp`** — `POST v1/recovery-email/verify/`, per the
     * auth contract, which names this call and `PATCH v1/recovery-email/` as its two consumers. This
     * client guessed `user-login/send-otp/ { purpose: 'verify' }` for a while: the *login* OTP, a
     * different code from a different family.
     *
     * ⚠ **`422 AU001` means "already has a passcode — use `PATCH`".** So this is strictly *first*
     * setup and cannot be reused to edit one field of an existing record, which is what the recovery
     * address briefly went through here.
     *
     * **Never retried** (`client.ts` will not replay a POST without `{ retry: true }`), and here that
     * matters twice: a replay would spend an OTP the reader cannot re-obtain without another email,
     * and a 502 arriving after the record landed would turn "try again" into a second passcode.
     *
     */
    createPasscode(
        payload: { passcode: string; passcodeHint: string; recoveryEmail: string; otp: string },
        accountId?: string | null,
        signal?: AbortSignal,
    ) {
        return api.post<unknown>(
            'v1/two-fa/passcode/',
            {
                passcode: payload.passcode,
                passcode_hint: payload.passcodeHint,
                recovery_email: payload.recoveryEmail,
                otp: payload.otp,
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Replace a passcode the account **knows** — `PATCH v1/two-fa/passcode/`.
     *
     * The counterpart of `resetPasscode`, and the difference is the authority presented: there it is an
     * emailed OTP, here it is the current passcode. Both write the same field, and mixing them up is
     * the one dangerous confusion in this file — `reset/` with a passcode the reader typed from memory
     * would be a passcode change with no proof of anything at all.
     *
     * `passcode` is the **current** one and `new_passcode` the replacement, which is legacy's spelling
     * (`models/twoFa.js`) and not a shape this client chose.
     *
     * ✅ **`new_passcode` is required, confirmed live.** A `PATCH { passcode, recovery_email }` — the
     * shape this client briefly used to change the recovery address — comes back
     * `{ success: false, code: "validation_error", message: "Passcode must be 6 digits" }` even with a
     * six-digit `passcode`, because the field it is complaining about is the missing `new_passcode`.
     * So this route changes the **passcode and nothing else**: it is not an "update the record"
     * endpoint, and the recovery address goes through `createPasscode` below. It is also the spelling that survives a
     * typo silently — sending the new value as `passcode` would read as "the current one is wrong",
     * so the call is pinned by a test.
     *
     * ## The hint always goes, because the reader always chooses it
     *
     * Legacy's JSDoc lists `passcode_hint` on this call, and the design's change flow **asks for
     * one**: *New verification code* → *Re-enter* → **Create hint**, with *Skip* and *Continue*
     * (Figma `Two-step verification`, `1082:138780`). So there is nothing to preserve and nothing to
     * guess — the field carries what the reader just typed, or `''` for *Skip*, which is legacy's own
     * `handleSkipHint` and a value rather than an omission.
     *
     * That removed the guess this signature used to make. It re-sent the *existing* hint read back
     * from `getPasscode`, on the theory that a `PATCH` which replaces rather than merges would
     * otherwise drop it — defensible while the flow had no hint step, and dead weight now.
     * `undefined` still omits the key, for a caller that has no hint step of its own.
     */
    updatePasscode(
        payload: { passcode: string; newPasscode: string; passcodeHint?: string },
        accountId?: string | null,
        signal?: AbortSignal,
    ) {
        return api.patch<unknown>(
            'v1/two-fa/passcode/',
            {
                passcode: payload.passcode,
                new_passcode: payload.newPasscode,
                ...(payload.passcodeHint === undefined
                    ? {}
                    : { passcode_hint: payload.passcodeHint }),
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Turn two-step verification **off** — `DELETE v1/two-fa/passcode/`.
     *
     * ✅ **It takes `{ passcode }`** — confirmed against the auth contract, and legacy is wrong here:
     * its `deletePasscode()` sends no body at all. So the endpoint enforces the re-auth itself rather
     * than trusting the client to have gated the button, which is the right way round and one fewer
     * thing this app has to be careful about. The passcode the gate proved is what goes.
     *
     * ⚠ Unlike every other call here this one **is** retried by `client.ts` (DELETE is on the
     * idempotent list), which is correct: deleting a passcode twice leaves no passcode. It is also the
     * reason a 5xx here must not be reported as "still on" — the retry may well have landed, so the
     * screen re-reads `/me` rather than asserting either state.
     */
    deletePasscode(passcode: string, accountId?: string | null, signal?: AbortSignal) {
        return api.del<unknown>('v1/two-fa/passcode/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
            /*
             * DELETE carries a body, which axios only sends from `config.data` — there is no body
             * argument on `del`. Easy to write and have silently dropped, which is why the passcode is
             * a required parameter here rather than an optional one.
             */
            data: { passcode },
        })
    },

    /**
     * Send an OTP to a **prospective** recovery address — `POST v1/recovery-email/verify/`.
     *
     * ⚠ **Not under `v1/two-fa/`.** The recovery address is its own two-endpoint family at the auth
     * root, which is why sixteen probes under `two-fa/`, `me/` and `user-login/` all answered 404 and
     * this client spent a while guessing — it was asking `user-login/send-otp/ { purpose: 'verify' }`,
     * which is the *login* OTP and a different code from a different family.
     *
     * One OTP, two consumers, per the auth contract: it is redeemed either by `saveRecoveryEmail`
     * below (changing the address) or by `createPasscode` (turning 2FA on, where the address and the
     * passcode are set in one call). Both flows therefore send the code the same way.
     */
    sendRecoveryEmailOtp(recoveryEmail: string, accountId?: string | null, signal?: AbortSignal) {
        return api.post<unknown>(
            'v1/recovery-email/verify/',
            { recovery_email: recoveryEmail },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },

    /**
     * Confirm and store the recovery address — `PATCH v1/recovery-email/`.
     *
     * `{ recovery_email, otp }` and **nothing else** — no passcode. The screen that reaches it sits
     * behind the passcode gate all the same, because it is one of the three management actions and
     * that is where the app puts it; but the endpoint's own authority is the OTP.
     *
     * ⚠ **`422 AU004` means "already set"**, which is the open question on this call: the contract
     * documents it as *confirm and save*, while the app offers *Change recovery email* to accounts
     * that plainly have one. Either AU004 is narrower than it reads, or a different call replaces an
     * existing address — **B92**. The failure is loud either way and the reader is shown the API's own
     * sentence (`docs/API_ERRORS.md`), which is what a guess here is allowed to cost.
     */
    saveRecoveryEmail(
        payload: { recoveryEmail: string; otp: string },
        accountId?: string | null,
        signal?: AbortSignal,
    ) {
        return api.patch<unknown>(
            'v1/recovery-email/',
            { recovery_email: payload.recoveryEmail, otp: payload.otp },
            { signal, ...(accountId ? { accountId } : {}) },
        )
    },
}

/**
 * The recovery address out of whatever `recover/` returned, or `null`.
 *
 * `looseObject` at both levels: the field is not in any schema, and a body that carries more than this
 * is normal. Exported for its test rather than for a second caller.
 */
const recoverSchema = z.looseObject({
    recovery_email: z.unknown().optional(),
    email: z.unknown().optional(),
    data: z
        .looseObject({ recovery_email: z.unknown().optional(), email: z.unknown().optional() })
        .optional(),
})

export function recoveryEmailOf(body: unknown): string | null {
    const parsed = recoverSchema.safeParse(body)
    if (!parsed.success) return null
    const { recovery_email, email, data } = parsed.data
    for (const candidate of [recovery_email, email, data?.recovery_email, data?.email]) {
        if (typeof candidate !== 'string') continue
        const text = candidate.trim()
        /*
         * Must look like an address, and must be short. The point of printing it is that the reader
         * recognises which inbox to open — a bare `true`, an id, or a paragraph does none of that, and
         * an unrecognisable string next to "we sent a code to" is worse than the generic sentence.
         */
        if (text.length > 0 && text.length <= 254 && text.includes('@')) return text
    }
    return null
}

/**
 * The passcode record's query key, per account.
 *
 * Keyed on the account for `authKeys.me`'s reason, and here it is sharper than usual: the value is a
 * *hint for a credential*. An entry that outlived a switch would print one account's memory aid on
 * another account's screen.
 *
 * It lives beside its model rather than in `authKeys`, which is the repo's rule ("query keys live next
 * to their model") and also the reason this file is a second model at all.
 */
export const twoFaKeys = {
    passcode: (accountId: string | null) =>
        ['auth', 'two-fa', 'passcode', accountId ?? 'anon'] as const,
}

/** What `GET v1/two-fa/passcode/` is read for. Both fields are display only. */
export interface TwoFaPasscodeRecord {
    /** The memory aid the account wrote, or `null` — including for an account that skipped it. */
    hint: string | null
    /** Where a recovery code would be mailed, or `null` when the body did not say. */
    recoveryEmail: string | null
}

/**
 * The record's two fields out of whatever the endpoint answered.
 *
 * `looseObject`, optional everywhere, nested `data` accepted — the same treatment `recoveryEmailOf`
 * gets and for the same reason: **the shape is unverified** (B92). Nothing here may throw and nothing
 * here may guess. A field this parser cannot read comes back `null`, and every consumer renders the
 * absence rather than a placeholder.
 *
 * The hint is **not** validated the way the address is. An address that does not look like one is
 * useless (it cannot name an inbox), but a hint is free text the account wrote about its own
 * passcode — "🎂" and "the usual" are both good hints — so the only rules are non-blank and a length
 * that cannot break the layout.
 */
const passcodeSchema = z.looseObject({
    passcode_hint: z.unknown().optional(),
    hint: z.unknown().optional(),
    recovery_email: z.unknown().optional(),
    email: z.unknown().optional(),
    data: z
        .looseObject({
            passcode_hint: z.unknown().optional(),
            hint: z.unknown().optional(),
            recovery_email: z.unknown().optional(),
            email: z.unknown().optional(),
        })
        .optional(),
})

/**
 * Longer than this is not a hint, it is a paste. `HINT_MAX_LENGTH` is 50 on the way in, but this
 * value comes from the server and may predate that cap or come from another client, so the reader is
 * given a generous ceiling rather than the write's own.
 */
const MAX_HINT_LENGTH = 200

export function passcodeRecordOf(body: unknown): TwoFaPasscodeRecord {
    const parsed = passcodeSchema.safeParse(body)
    if (!parsed.success) return { hint: null, recoveryEmail: null }
    const { passcode_hint, hint, data } = parsed.data

    let text: string | null = null
    for (const candidate of [passcode_hint, hint, data?.passcode_hint, data?.hint]) {
        if (typeof candidate !== 'string') continue
        const trimmed = candidate.trim()
        if (trimmed.length > 0 && trimmed.length <= MAX_HINT_LENGTH) {
            text = trimmed
            break
        }
    }

    // The address is `recoveryEmailOf`'s job, spelling rules and all — one reader, not two that can
    // drift. It accepts the same body shape this schema does.
    return { hint: text, recoveryEmail: recoveryEmailOf(body) }
}
