import { setDeviceInfo } from '@shared/lib/api/request-context'
import { STORAGE_KEYS, storage } from '@shared/lib/storage'

let cached: string | null = null

function describeDevice(device_id: string) {
    return {
        device_id,
        device_type: 'web',
        os: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        device_name: 'web',
    }
}

/**
 * Publish an already-known device id without waiting on anything.
 *
 * Returns whether there was one. Every visitor past their first has the id in
 * localStorage, so this is the normal path — and it matters that it is
 * synchronous: bootstrap no longer awaits `initDeviceInfo` before fetching `/me`,
 * and even an immediately-resolved promise costs a microtask, which would be long
 * enough for that request to go out with no `device-id` header.
 */
export function primeDeviceInfo(): boolean {
    if (typeof window === 'undefined') return false
    const id = cached ?? storage.get(STORAGE_KEYS.deviceId)
    if (!id) return false
    cached = id
    setDeviceInfo(describeDevice(id))
    return true
}

/** Resolve a stable device id via FingerprintJS, cached in localStorage. */
export async function getDeviceId(): Promise<string> {
    if (cached) return cached
    if (typeof window === 'undefined') return ''

    const stored = storage.get(STORAGE_KEYS.deviceId)
    if (stored) {
        cached = stored
        return stored
    }

    let id: string
    try {
        const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
        const fp = await FingerprintJS.load()
        const result = await fp.get()
        id = result.visitorId
    } catch {
        id = crypto.randomUUID()
    }

    cached = id
    storage.set(STORAGE_KEYS.deviceId, id)
    return id
}

/**
 * Initialize device info into the shared request context (headers + refresh body).
 *
 * On a first-ever visit this is the expensive path — dynamic-import FingerprintJS,
 * load it, run it — so callers that only need the id *eventually* should let it
 * settle in the background after `primeDeviceInfo()` has covered the common case.
 * Anything that mints tokens must await it: `device_id` is part of those payloads.
 */
export async function initDeviceInfo(): Promise<string> {
    const device_id = await getDeviceId()
    setDeviceInfo(describeDevice(device_id))
    return device_id
}
