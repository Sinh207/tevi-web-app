import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { getDeviceInfo } from '@shared/lib/api/request-context'
import type { AxiosRequestConfig } from 'axios'

/** Auth microservice: `${W_API}/auth`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/auth` })

/**
 * Query keys for anything auth-backed.
 *
 * `/me` is keyed by account id, not by "the current user": the answer is different
 * per account, and a cache entry that outlives a switch would hand the previous
 * user's profile to the next one.
 */
export const authKeys = {
    me: (accountId: string | null) => ['auth', 'me', accountId ?? 'anon'] as const,
    /**
     * `GET v1/user-login/` — which sign-in credentials this account actually has.
     *
     * Keyed per account for the same reason `/me` is: "does this account have a password"
     * is a different answer for every account, and an entry that outlived a switch would
     * offer the wrong screen (change vs. create) to the next user.
     */
    userLogin: (accountId: string | null) => ['auth', 'user-login', accountId ?? 'anon'] as const,
}

export interface TokenResponse {
    access_token: string
    refresh_token: string
    expires_in: number
    user?: Record<string, unknown>
}

type Provider =
    | 'google'
    | 'apple'
    | 'facebook'
    | 'twitter'
    | 'tiktok'
    | 'telegram'
    | 'line'
    | 'petra'

/**
 * How the credential endpoints identify a person.
 *
 * Not `{ email }` / `{ phone }` — the backend takes a tagged pair, so one payload
 * shape covers both and adding a third kind does not change the endpoint. Sending
 * a bare `email` field (which this client used to do) is simply not a request the
 * API recognises.
 */
export interface Username {
    kind: 'email' | 'phone'
    value: string
}

/**
 * What `GET v1/user-login/` answers: the identifiers this account can sign in *with*.
 *
 * Both fields optional, and an account with neither is the normal state for someone who
 * has only ever used a social provider — that is the case the password settings screen
 * exists to fix. Nothing beyond these two is modelled because nothing beyond them is used;
 * the client reads presence, never the value's shape.
 */
export interface UserLogin {
    email?: string
    phone?: string
}

/**
 * Why an OTP was requested. The backend scopes the code to its purpose, so the
 * same digits cannot be replayed against a different flow.
 *
 * The three values are what legacy actually sends, not a guess:
 *
 * - `reset` — forgot password (`containers/loginWithEmail`).
 * - `verify` — proving an address before a **first** password is set
 *   (`containers/settingPassword/hooks/useConnectEmail.js`, and again on verify).
 * - `setup` — never sent by legacy anywhere. It was inferred from the endpoint name
 *   `setup-credentials/` when this file was first written, and is kept only so the
 *   guess is visible rather than silently corrected; the settings flow uses `verify`.
 *   See B7 in `docs/BACKEND_QUESTIONS.md`.
 */
export type OtpPurpose = 'reset' | 'verify' | 'setup'

const withDevice = <T extends Record<string, unknown>>(payload: T) => ({
    ...payload,
    ...getDeviceInfo(),
})

/**
 * Endpoints that can answer **406 = "solve a Turnstile first"**, and so are the
 * only ones that should carry a solved challenge. The token is single-use; see
 * `turnstile` in `client.ts` for what broadcasting it cost.
 */
const CHALLENGEABLE: AxiosRequestConfig = { turnstile: true }

export const authApi = {
    /**
     * Whether a display name is acceptable — `POST v1/me/validate-display-name/`.
     *
     * **A rejection is a 4xx**, same contract as `channelApi.checkSlug`: there is no
     * `{ valid: false }` body to read, so this resolves to `true` and lets the error through with
     * the message the backend wrote ("too short", "contains a reserved word"). Only the caller knows
     * which field to put it under.
     *
     * Lives in the auth model rather than the channel one because the name being validated is the
     * **account's**, not the space's — legacy calls it from `@models/auth` for the same reason, and
     * the create-space form is only the first screen that happens to need it.
     */
    validateDisplayName(displayName: string, signal?: AbortSignal) {
        return api.post<unknown>(
            'v1/me/validate-display-name/',
            { display_name: displayName },
            { signal },
        )
    },

    /** Anonymous session — Firebase anon accessToken exchanged for a Tevi token. */
    connectAnonymous(firebaseAccessToken: string) {
        return api.post<TokenResponse>(
            'v1/token/',
            withDevice({ access_token: firebaseAccessToken }),
            {
                ...CHALLENGEABLE,
                // Authenticates *this* exchange. The request interceptor leaves an
                // Authorization header alone once set, so the previous account's
                // bearer cannot ride along on a call that mints a new identity.
                headers: { Authorization: `Bearer ${firebaseAccessToken}` },
            },
        )
    },

    /** Social connect — `v1/connect/<provider>/`. */
    connectProvider(provider: Provider, payload: Record<string, unknown>) {
        return api.post<TokenResponse>(
            `v1/connect/${provider}/`,
            withDevice(payload),
            CHALLENGEABLE,
        )
    },

    /**
     * The active account's profile.
     *
     * `accountId` pins which account the request acts as. Without it the bearer is
     * whoever happens to be active when the request goes out, which is not
     * necessarily who the caller decided to fetch a moment earlier — that race
     * filed one user's profile under another's query key.
     */
    getMe(accountId?: string | null) {
        return api.get<Record<string, unknown>>(
            'v1/me/',
            undefined,
            accountId ? { accountId } : undefined,
        )
    },
    /**
     * Patch the active account's profile. The backend takes a partial body and answers
     * with the whole updated user (legacy reads `res.data.data` and assigns it straight
     * to `currentUser` — `providers/authentication/index.js`), so the response is the
     * new truth and not just an acknowledgement.
     *
     * `accountId` pins the account for the same reason `getMe` does, and here the stakes
     * are higher: an unpinned write picks up whatever bearer is active when the request
     * goes out, so a switch landing mid-flight would apply one user's setting to another
     * user's profile.
     */
    updateMe(payload: Record<string, unknown>, accountId?: string | null) {
        return api.post<Record<string, unknown>>(
            'v1/me/',
            payload,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * End one account's session server-side.
     *
     * **The backend resolves which session to end from the bearer it is presented,
     * and from nothing else** (confirmed with the API team). Two consequences, and
     * both of them shape this method:
     *
     * 1. A logout is only ever *self*-revocation. One account can never sign another
     *    out, so the bearer has to be the right one before the call goes out.
     * 2. An **expired** bearer therefore does not end anything — it earns a 401 and
     *    the session stays alive. Legacy's switch-account dialog presents the stored
     *    access token as-is (`components/dialogs/switchAccount/index.js`) and
     *    swallows the result, so removing a stale account there silently leaves its
     *    session running for a user who believes they signed out of it.
     *
     * Hence `accountId` rather than a raw token: pinning the account routes the call
     * through the client's per-account handling, which renews an expired token from
     * *that* account's own refresh token first, replays once on a 401, and — if the
     * refresh itself is rejected — retires that account and only it. For an account
     * sitting unused in the switcher, that renewal is the normal path, not the edge
     * case.
     *
     * No body, matching legacy (`ApiAuthModel.post(VERSION + '/logout/')`). The
     * `device-id` header still goes.
     */
    logout(accountId?: string | null) {
        return api.post('v1/logout/', {}, accountId ? { accountId } : undefined)
    },

    /**
     * Hand back a token the client is not going to keep — see `handleTokenResponse`,
     * where a sign-in succeeds but the account limit refuses to store it.
     *
     * Separate from `logout()` because the token is **not in the store**: there is no
     * account record and so no refresh token behind it. That is fine here and only
     * here, because the token was minted moments ago and cannot have expired. Any
     * other caller wants `logout(accountId)`.
     *
     * Being outside the store also means the bearer is pinned rather than looked up,
     * which excludes it from the 401 refresh path — a token the backend rejects
     * cannot drag the active account's refresh flow in behind it.
     */
    revokeToken(accessToken: string) {
        return api.post('v1/logout/', {}, { accessToken })
    },

    /**
     * The Cloudflare Turnstile challenge to present after a 406.
     *
     * `challenge_id` is not optional in practice: legacy pins it to the
     * `X-Turnstile-Challenge` header before replaying the sign-in
     * (`tevi-web-app`: `providers/authentication/index.js` → `getTurnstile`), and the
     * backend pairs it with the token the widget will produce, so fetching the challenge
     * without pinning it makes the replay unverifiable.
     */
    getTurnstile() {
        return api.get<{ site_key: string; challenge_id?: string }>('v1/turnstile/')
    },

    /** QR device-link login. */
    createDeviceLink() {
        return api.post<{ token: string; ws_channel: string }>('v1/device-links/', withDevice({}))
    },

    // ── Email / credential flow ─────────────────────────────────────────────
    /**
     * Whether this account has a password set (social-only accounts do not).
     *
     * **Not the same question as `/me`'s `email`.** An account created with Google carries
     * a Google address on its profile and still has no password — so reading `/me` to
     * decide between "change your password" and "create one" offers the wrong screen to
     * every social-only account, which is most of them. This endpoint is the one that
     * answers it, and it is why legacy fetches it separately (`AuthContext.userLogin`).
     */
    getUserLogin() {
        return api.get<UserLogin>('v1/user-login/')
    },

    userLogin(payload: { username: Username; password: string }) {
        return api.post<TokenResponse>('v1/user-login/login/', withDevice(payload), CHALLENGEABLE)
    },

    /**
     * Start an OTP flow. The `sid` in the response identifies *this* attempt and
     * has to be carried through verify/reset/setup — without it the backend cannot
     * tell which send the code belongs to, so the flow cannot be completed.
     */
    sendOtp(payload: { username: Username; purpose: OtpPurpose }) {
        return api.post<{ sid: string }>('v1/user-login/send-otp/', payload)
    },
    verifyOtp(payload: { username: Username; otp: string; purpose: OtpPurpose; sid: string }) {
        return api.post<TokenResponse>(
            'v1/user-login/verify-otp/',
            withDevice(payload),
            CHALLENGEABLE,
        )
    },
    resetPassword(payload: { username: Username; otp: string; password: string; sid: string }) {
        return api.post('v1/user-login/reset-password/', payload)
    },
    /** First password for an account that only ever signed in through a provider. */
    setupCredentials(payload: { username: Username; otp: string; password: string; sid: string }) {
        return api.post('v1/user-login/setup-credentials/', payload)
    },
    changePassword(payload: { current_password: string; new_password: string }) {
        return api.post('v1/user-login/change-password/', payload)
    },
}
