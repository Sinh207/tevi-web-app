import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { getDeviceInfo } from '@shared/lib/api/request-context'

/** Auth microservice: `${W_API}/auth`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/auth` })

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

const withDevice = <T extends Record<string, unknown>>(payload: T) => ({
    ...payload,
    ...getDeviceInfo(),
})

export const authApi = {
    /** Anonymous session — Firebase anon accessToken exchanged for a Tevi token. */
    connectAnonymous(firebaseAccessToken: string) {
        return api.post<TokenResponse>(
            'v1/token/',
            withDevice({ access_token: firebaseAccessToken }),
            { headers: { Authorization: `Bearer ${firebaseAccessToken}` } },
        )
    },

    /** Social connect — `v1/connect/<provider>/`. */
    connectProvider(provider: Provider, payload: Record<string, unknown>) {
        return api.post<TokenResponse>(`v1/connect/${provider}/`, withDevice(payload))
    },

    getMe() {
        return api.get<Record<string, unknown>>('v1/me/')
    },
    updateMe(payload: Record<string, unknown>) {
        return api.post('v1/me/', payload)
    },

    logout() {
        return api.post('v1/logout/', withDevice({}))
    },

    getTurnstile() {
        return api.get<{ site_key: string }>('v1/turnstile/')
    },

    /** QR device-link login. */
    createDeviceLink() {
        return api.post<{ token: string; ws_channel: string }>('v1/device-links/', withDevice({}))
    },

    // ── Email / credential flow ─────────────────────────────────────────────
    userLogin(payload: { email?: string; phone?: string; password: string }) {
        return api.post<TokenResponse>('v1/user-login/login/', withDevice(payload))
    },
    sendOtp(payload: { email?: string; phone?: string }) {
        return api.post('v1/user-login/send-otp/', payload)
    },
    verifyOtp(payload: { email?: string; phone?: string; otp: string }) {
        return api.post<TokenResponse>('v1/user-login/verify-otp/', withDevice(payload))
    },
    resetPassword(payload: { email?: string; phone?: string; password: string; otp: string }) {
        return api.post('v1/user-login/reset-password/', payload)
    },
}
