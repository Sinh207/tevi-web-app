// @vitest-environment jsdom
import { apiClient } from '@shared/lib/api/client'
import { clearETagCache } from '@shared/lib/api/interceptors/etag'
import { setDeviceInfo } from '@shared/lib/api/request-context'
import { clearTokens } from '@shared/lib/api/token'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it } from 'vitest'
import { authApi } from './auth-api'

/**
 * The wire contract, pinned.
 *
 * These endpoints had no test at all, and the credential ones were being called
 * with a payload the backend does not accept — `{ email, password }` where it
 * wants `{ username: { kind, value }, password }`. A shape that wrong is invisible
 * in TypeScript (both sides are objects) and only shows up as a 4xx at runtime, so
 * it belongs in a test that reads the request that actually went out.
 */

const API = 'https://wapi.tevi.dev'

let seen: InternalAxiosRequestConfig[] = []

const adapter: AxiosAdapter = config => {
    seen.push(config)
    return Promise.resolve({
        status: 200,
        statusText: '',
        data: { data: {} },
        headers: {},
        config,
    } as unknown as AxiosResponse)
}

const body = (n = 0) => JSON.parse(String(seen[n].data ?? '{}'))

beforeEach(async () => {
    localStorage.clear()
    clearTokens()
    await clearETagCache()
    seen = []
    apiClient.defaults.adapter = adapter
    setDeviceInfo({ device_id: 'dev-1', device_type: 'web', os: 'test', device_name: 'web' })
})

describe('endpoint paths', () => {
    it('hits the auth microservice under /auth/v1', async () => {
        await authApi.getMe()
        await authApi.getTurnstile()
        await authApi.getUserLogin()

        expect(seen.map(c => c.url)).toEqual([
            `${API}/auth/v1/me/`,
            `${API}/auth/v1/turnstile/`,
            `${API}/auth/v1/user-login/`,
        ])
    })
})

describe('credential payloads', () => {
    it('identifies the user with a tagged username pair, not a bare field', async () => {
        await authApi.userLogin({
            username: { kind: 'email', value: 'sinh@tevi.com' },
            password: 'hunter2',
        })

        expect(seen[0].url).toBe(`${API}/auth/v1/user-login/login/`)
        expect(body()).toMatchObject({
            username: { kind: 'email', value: 'sinh@tevi.com' },
            password: 'hunter2',
        })
        expect(body()).not.toHaveProperty('email')
    })

    it('carries `purpose` on send-otp and threads `sid` through the rest', async () => {
        const u = { kind: 'email' as const, value: 'sinh@tevi.com' }
        await authApi.sendOtp({ username: u, purpose: 'reset' })
        await authApi.verifyOtp({ username: u, otp: '123456', purpose: 'reset', sid: 's-1' })
        await authApi.resetPassword({ username: u, otp: '123456', new_password: 'new', sid: 's-1' })
        await authApi.setupCredentials({ username: u, otp: '123456', password: 'new', sid: 's-1' })

        expect(body(0)).toMatchObject({ purpose: 'reset' })
        // `sid` is **required** on every step after the send (B7, answered): without it the
        // backend cannot tell which send a code belongs to, so dropping it silently makes
        // the whole reset flow uncompletable.
        expect(body(1).sid).toBe('s-1')
        expect(body(2).sid).toBe('s-1')
        expect(body(3).sid).toBe('s-1')
    })

    it('spells the new password differently on the two endpoints that set one', async () => {
        // Confirmed by the API team (B7): `reset-password/` takes `new_password`,
        // `setup-credentials/` takes `password`. Both screens hold the value in a local
        // called `password`, so passing it straight through is the natural mistake — and it
        // costs a 400 on the last screen of a flow the reader cannot restart without a new
        // code. `tsc` catches it now that the two signatures disagree; this is the fence
        // against somebody "tidying" them back into agreement.
        const u = { kind: 'email' as const, value: 'sinh@tevi.com' }
        await authApi.resetPassword({ username: u, otp: '123456', new_password: 'new', sid: 's' })
        await authApi.setupCredentials({ username: u, otp: '123456', password: 'new', sid: 's' })

        expect(body(0)).toMatchObject({ new_password: 'new' })
        expect(body(0)).not.toHaveProperty('password')
        expect(body(1)).toMatchObject({ password: 'new' })
        expect(body(1)).not.toHaveProperty('new_password')
    })

    it("sends the settings flow's own purpose, `verify`", async () => {
        // Not `setup`. Legacy's `containers/settingPassword` sends `verify` on both the
        // send and the check (`useConnectEmail.js`, `components/verifyCode`), and this is
        // the flow `PasswordSetupFlow` ports — a value the API does not recognise fails at
        // runtime with nothing on screen explaining it. See B7 in BACKEND_QUESTIONS.
        const u = { kind: 'email' as const, value: 'sinh@tevi.com' }
        await authApi.sendOtp({ username: u, purpose: 'verify' })
        await authApi.verifyOtp({ username: u, otp: '123456', purpose: 'verify', sid: 's-2' })

        expect(body(0)).toMatchObject({ purpose: 'verify' })
        expect(body(1)).toMatchObject({ purpose: 'verify', sid: 's-2' })
    })

    it('changes a password with the snake_case pair the endpoint takes', async () => {
        await authApi.changePassword({ current_password: 'old', new_password: 'new' })

        expect(seen[0].url).toBe(`${API}/auth/v1/user-login/change-password/`)
        expect(body()).toEqual({ current_password: 'old', new_password: 'new' })
        // No username, no sid: the bearer says who, and the current password authorises.
        expect(body()).not.toHaveProperty('username')
    })
})

describe('device info', () => {
    it('rides on token-minting calls', async () => {
        await authApi.userLogin({
            username: { kind: 'email', value: 'a@b.c' },
            password: 'p',
        })
        expect(body()).toMatchObject({ device_id: 'dev-1', device_type: 'web' })
    })

    it('is left off the pure OTP/password calls, matching legacy', async () => {
        await authApi.sendOtp({ username: { kind: 'email', value: 'a@b.c' }, purpose: 'reset' })
        expect(body()).not.toHaveProperty('device_id')
    })
})

describe('Turnstile opt-in', () => {
    it('is set on exactly the endpoints that can answer 406', async () => {
        await authApi.userLogin({ username: { kind: 'email', value: 'a@b.c' }, password: 'p' })
        await authApi.connectProvider('google', { access_token: 'tok' })
        await authApi.connectAnonymous('firebase-tok')
        await authApi.verifyOtp({
            username: { kind: 'email', value: 'a@b.c' },
            otp: '1',
            purpose: 'reset',
            sid: 's',
        })
        expect(seen.every(c => c.turnstile === true)).toBe(true)
    })

    it('is NOT set on the call that fetches the challenge, or on /me', async () => {
        await authApi.getTurnstile()
        await authApi.getMe()
        expect(seen.map(c => c.turnstile)).toEqual([undefined, undefined])
    })
})

describe('anonymous exchange', () => {
    it('authenticates itself with the Firebase token instead of the current account', async () => {
        await authApi.connectAnonymous('firebase-tok')

        // The request interceptor leaves an Authorization header alone once set, so
        // this is what stops the previous account's bearer riding along on a call
        // that mints a brand-new identity.
        expect(seen[0].headers.get('Authorization')).toBe('Bearer firebase-tok')
        expect(body()).toMatchObject({ access_token: 'firebase-tok', device_id: 'dev-1' })
    })
})

describe('revokeToken — self-revocation only', () => {
    it('presents the token being revoked, not whoever is active', async () => {
        setDeviceInfo({ device_id: 'dev-1' })
        await authApi.revokeToken('token-to-drop')

        expect(seen[0].url).toBe(`${API}/auth/v1/logout/`)
        expect(seen[0].accessToken).toBe('token-to-drop')
        expect(seen[0].headers.get('Authorization')).toBe('Bearer token-to-drop')
    })

    it('sends an empty body — the bearer is what the backend resolves', async () => {
        setDeviceInfo({ device_id: 'dev-1' })
        await authApi.revokeToken('token-to-drop')

        expect(body()).toEqual({})
        expect(body()).not.toHaveProperty('device_id')
    })

    it('is not refreshable — a rejected token must not pull the active account in', async () => {
        // A pinned bearer is excluded from the 401 refresh path in client.ts.
        await authApi.revokeToken('token-to-drop')
        expect(seen[0].accountId).toBeUndefined()
    })

    it('logout() pins the account so the client can refresh it first', async () => {
        await authApi.logout('u2')
        // Not a raw bearer: naming the account is what lets the client renew an
        // expired token from that account's own refresh token before calling.
        expect(seen[0].accountId).toBe('u2')
        expect(seen[0].accessToken).toBeUndefined()
    })

    it('logout() sends no body either, matching legacy', async () => {
        setDeviceInfo({ device_id: 'dev-1' })
        await authApi.logout('u2')
        expect(body()).toEqual({})
        expect(seen[0].headers.get('device-id')).toBe('dev-1')
    })
})

describe('getMe', () => {
    it('pins the account when told which one, and leaves it open otherwise', async () => {
        await authApi.getMe('u1')
        await authApi.getMe()
        expect(seen[0].accountId).toBe('u1')
        expect(seen[1].accountId).toBeUndefined()
    })
})
