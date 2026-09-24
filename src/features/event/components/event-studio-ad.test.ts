import { env } from '@shared/config/env'
import { describe, expect, it } from 'vitest'
import { affiliateHref } from './event-studio-ad'

/**
 * **The ad tile's link** — a backend-supplied URL opened in a new tab, so both halves matter:
 * it is vetted before it can reach `window.open`, and it keeps legacy's origin rewrite
 * (`handleReplaceOriginUrl`) so a link minted on one environment opens on this one.
 */
describe('affiliateHref', () => {
    const origin = new URL(env.NEXT_PUBLIC_BASE_URL).origin

    it('keeps the path and query and takes this deployment’s origin', () => {
        expect(affiliateHref('https://staging.tevi.dev/r/abc?campaign=wc26#top')).toBe(
            `${origin}/r/abc?campaign=wc26#top`,
        )
    })

    it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', '', null, undefined])(
        'refuses %s rather than opening it',
        value => {
            expect(affiliateHref(value as string | null | undefined)).toBeNull()
        },
    )
})
