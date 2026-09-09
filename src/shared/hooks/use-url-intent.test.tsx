// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUrlIntent } from './use-url-intent'

/**
 * Two failures this exists to prevent, and neither one throws.
 *
 * 1. **Acting twice.** A dialog opened by a deep link must open once. React's development
 *    double-effect and an unstable `open` identity each re-fire the caller's effect on their own,
 *    so "the URL no longer says it" is not a guard.
 * 2. **Sweeping up somebody else's query.** Only `action` is ours to remove; `?tab=` and the
 *    campaign parameters beside it belong to the reader.
 */

const nav = vi.hoisted(() => ({ pathname: '/@ada/direct-donation', search: '' }))

vi.mock('next/navigation', () => ({
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(nav.search),
}))

/** Stands in for `@features/channel/routes` — the same shape, without the import. */
const parse = (pathname: string, search: URLSearchParams) =>
    pathname.endsWith('/direct-donation')
        ? 'donate'
        : search.get('action') === 'direct_donation'
          ? 'donate'
          : null
const clean = (pathname: string) => pathname.replace(/\/direct-donation$/, '') || null

function renderProbe() {
    const seen: { intent: string | null; consume: () => boolean }[] = []
    function Probe() {
        seen.push(useUrlIntent(parse, clean))
        return null
    }
    const utils = render(<Probe />)
    return {
        ...utils,
        seen,
        latest: () => seen[seen.length - 1],
        again: () => utils.rerender(<Probe />),
    }
}

beforeEach(() => {
    nav.pathname = '/@ada/direct-donation'
    nav.search = ''
    window.history.replaceState({}, '', '/@ada/direct-donation')
})

describe('useUrlIntent', () => {
    it('reads the intent and takes the path back out of the address bar', () => {
        const probe = renderProbe()
        expect(probe.latest().intent).toBe('donate')

        act(() => {
            expect(probe.latest().consume()).toBe(true)
        })
        expect(window.location.pathname).toBe('/@ada')
    })

    it('answers false on every call after the first', () => {
        const probe = renderProbe()
        act(() => {
            probe.latest().consume()
        })
        // The URL has already changed; a caller whose effect re-fires must still be told no.
        expect(probe.latest().consume()).toBe(false)
    })

    /**
     * The one that matters in production: `usePathname` is mocked to a value that does **not**
     * follow `replaceState`, which is the pessimistic case. The intent must still stop.
     */
    it('stops even when the router hook does not follow the rewrite', () => {
        const probe = renderProbe()
        act(() => {
            probe.latest().consume()
        })
        // `usePathname` is mocked to a value that does *not* follow `replaceState` — the pessimistic
        // case, since Next only documents that sync for `useSearchParams`. The next render must
        // still report nothing to do.
        act(() => {
            probe.again()
        })
        expect(probe.latest().intent).toBeNull()
    })

    it('keeps the rest of the query and removes only `action`', () => {
        nav.pathname = '/@ada'
        nav.search = 'action=direct_donation&tab=media&utm_source=x'
        window.history.replaceState({}, '', '/@ada?action=direct_donation&tab=media&utm_source=x')

        const probe = renderProbe()
        expect(probe.latest().intent).toBe('donate')
        act(() => {
            probe.latest().consume()
        })
        expect(window.location.pathname).toBe('/@ada')
        expect(new URLSearchParams(window.location.search).get('action')).toBeNull()
        expect(new URLSearchParams(window.location.search).get('tab')).toBe('media')
        expect(new URLSearchParams(window.location.search).get('utm_source')).toBe('x')
    })

    it('is inert on a URL the parser does not recognise', () => {
        nav.pathname = '/settings'
        nav.search = ''
        const probe = renderProbe()
        expect(probe.latest().intent).toBeNull()
    })
})
