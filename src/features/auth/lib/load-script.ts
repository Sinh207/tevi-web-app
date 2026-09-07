/**
 * Load a third-party SDK once per page and resolve when its global is ready.
 *
 * Every social provider in the legacy app carried its own copy of this — create a
 * `<script>`, append it, flip an `isSDKLoaded` state, and hope. That duplication is why
 * two of them re-appended the tag on remount and one leaked the element on unmount.
 *
 * Keyed by `src`, so concurrent callers share one request and a second mount gets the
 * already-resolved promise instead of a second tag. A failure clears the cache so a
 * later attempt can retry — caching a rejection would leave the button dead for the
 * lifetime of the page.
 *
 * These scripts run under `'strict-dynamic'`: they are injected *by* an already-trusted
 * script, which is what makes them allowed without naming their hosts in the CSP.
 */

const pending = new Map<string, Promise<void>>()

export function loadScript(src: string): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve()

    const cached = pending.get(src)
    if (cached) return cached

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing?.dataset.loaded === 'true') return Promise.resolve()

    const promise = new Promise<void>((resolve, reject) => {
        const script = existing ?? document.createElement('script')
        script.src = src
        script.async = true
        script.defer = true
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true'
            resolve()
        })
        script.addEventListener('error', () => {
            pending.delete(src)
            reject(new Error(`Failed to load ${src}`))
        })
        if (!existing) document.body.appendChild(script)
    })

    pending.set(src, promise)
    return promise
}
