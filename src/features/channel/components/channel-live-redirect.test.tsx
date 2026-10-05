// @vitest-environment jsdom
import { inAppReferrer, resetInAppReferrer, useTrackInAppRoute } from '@shared/lib/in-app-referrer'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/types'

const nav = vi.hoisted(() => ({ pathname: '/@ada', replace: vi.fn() }))
vi.mock('next/navigation', () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ replace: nav.replace }),
    useSearchParams: () => new URLSearchParams(),
}))

const channel = {
    slug: 'ada',
    lives: [{ code: 'abc', status: 'LIVE' }],
} as unknown as Channel

function Tracker() {
    useTrackInAppRoute()
    return null
}

/** Each case gets a fresh copy of the redirect's once-per-document memory. */
async function load() {
    vi.resetModules()
    const referrer = await import('@shared/lib/in-app-referrer')
    const { ChannelLiveRedirect } = await import('./channel-live-redirect')
    function FreshTracker() {
        referrer.useTrackInAppRoute()
        return null
    }
    return { Redirect: ChannelLiveRedirect, Tracker: FreshTracker }
}

beforeEach(() => {
    resetInAppReferrer()
    nav.replace.mockReset()
})
afterEach(cleanup)

describe('inAppReferrer', () => {
    it('answers the previous route whichever order the effects ran in', () => {
        nav.pathname = '/following'
        const { rerender } = render(<Tracker />)
        expect(inAppReferrer('/@ada')).toBe('/following') // tracker has not seen /@ada yet
        nav.pathname = '/@ada'
        rerender(<Tracker />)
        expect(inAppReferrer('/@ada')).toBe('/following') // it has
    })

    it('is null on the document’s first route', () => {
        expect(inAppReferrer('/@ada')).toBeNull()
    })
})

describe('ChannelLiveRedirect', () => {
    it('forwards an outside arrival into the live', async () => {
        const { Redirect } = await load()
        nav.pathname = '/@ada'
        render(<Redirect channel={channel} />)
        expect(nav.replace).toHaveBeenCalledWith('/@ada/event/abc')
    })

    it('does not forward back into the live the reader just left — the loop', async () => {
        const { Redirect, Tracker } = await load()
        // Following → the live, by client-side navigation: `document.referrer` stays empty.
        nav.pathname = '/following'
        const { rerender } = render(<Tracker />)
        nav.pathname = '/@ada/event/abc'
        rerender(<Tracker />)
        // Back to the space.
        nav.pathname = '/@ada'
        render(<Redirect channel={channel} />)
        expect(nav.replace).not.toHaveBeenCalled()
    })

    it('forwards a space at most once per document', async () => {
        const { Redirect } = await load()
        nav.pathname = '/@ada'
        const first = render(<Redirect channel={channel} />)
        first.unmount()
        render(<Redirect channel={channel} />)
        expect(nav.replace).toHaveBeenCalledTimes(1)
    })
})
