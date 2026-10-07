import { BASE_URL } from '@shared/config/env'

/** Hosts that are this app — legacy's four origins, plus whatever this deployment is served from. */
const TEVI_HOSTS = new Set(['tevi.com', 'web.tevi.com', 'tevi.dev', 'web.tevi.dev'])

function isTeviHost(host: string, extra: string | null): boolean {
    const bare = host.toLowerCase().replace(/^www\./, '')
    return TEVI_HOSTS.has(bare) || (!!extra && bare === extra)
}

export const OWN_HOST = (() => {
    try {
        return new URL(BASE_URL).hostname.toLowerCase().replace(/^www\./, '')
    } catch {
        return null
    }
})()

/**
 * The in-app path for a Tevi URL, or `null` for anywhere else.
 *
 * A Tevi link opens **here**, as a client-side navigation — iOS routes every Tevi host through its
 * deep-link handler for the same reason. Legacy sends each one to a new tab, which reloads the
 * whole app to show a page this tab could have shown. Used by a message's links
 * (`features/message`) and a post's promote card (`features/post`).
 */
export function teviPath(href: string, ownHost: string | null = OWN_HOST): string | null {
    let url: URL
    try {
        url = new URL(href)
    } catch {
        return null
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!isTeviHost(url.hostname, ownHost)) return null
    return `${url.pathname}${url.search}${url.hash}` || '/'
}
