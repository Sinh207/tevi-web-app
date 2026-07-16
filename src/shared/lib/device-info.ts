import { setDeviceInfo } from '@shared/lib/api/request-context'

const LS_DEVICE_ID = 'device_id'

let cached: string | null = null

/** Resolve a stable device id via FingerprintJS, cached in localStorage. */
export async function getDeviceId(): Promise<string> {
    if (cached) return cached
    if (typeof window === 'undefined') return ''

    const stored = window.localStorage.getItem(LS_DEVICE_ID)
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
    try {
        window.localStorage.setItem(LS_DEVICE_ID, id)
    } catch {
        // ignore
    }
    return id
}

/** Initialize device info into the shared request context (headers + refresh body). */
export async function initDeviceInfo(): Promise<string> {
    const device_id = await getDeviceId()
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    setDeviceInfo({
        device_id,
        device_type: 'web',
        os: ua,
        device_name: 'web',
    })
    return device_id
}
