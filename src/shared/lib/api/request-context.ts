/**
 * Mutable request context shared between the axios client (shared) and the auth
 * feature. Keeps the client dependency-free of `features/*` while still letting
 * auth inject the device fingerprint and Cloudflare Turnstile tokens.
 */

export interface DeviceInfo {
    device_id?: string
    device_type?: string
    os?: string
    device_name?: string
}

interface TurnstileTokens {
    token?: string
    challenge?: string
}

let deviceInfo: DeviceInfo = {}
let turnstile: TurnstileTokens = {}

export function setDeviceInfo(info: DeviceInfo) {
    deviceInfo = { ...deviceInfo, ...info }
}
export function getDeviceInfo(): DeviceInfo {
    return deviceInfo
}

export function setTurnstileTokens(t: TurnstileTokens) {
    turnstile = { ...turnstile, ...t }
}

/**
 * Forget the challenge.
 *
 * A Turnstile token is single-use — once the backend has redeemed it, replaying it on
 * the next request is at best noise and at worst a rejected call. Cleared after a
 * sign-in resolves, and on sign-out.
 */
export function clearTurnstileTokens() {
    turnstile = {}
}
export function getTurnstileHeaders(): Record<string, string> {
    const h: Record<string, string> = {}
    if (turnstile.token) h['X-Turnstile-Token'] = turnstile.token
    if (turnstile.challenge) h['X-Turnstile-Challenge'] = turnstile.challenge
    return h
}
