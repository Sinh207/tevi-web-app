// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eventReportPath } from '../routes'
import { useCanonicalEventSlug } from './use-canonical-event-slug'

/**
 * The address bar against the event's own handle.
 *
 * Every claim here is about *when* the correction fires, and each wrong answer looks like a working
 * page: a correction that never fires leaves a URL the reader will copy and share; one that fires on
 * an absent payload moves somebody off a URL that was probably right; one that fires on a URL it has
 * already corrected is an infinite `replace` loop, which a browser shows as a page that will not
 * settle. None of the three is visible in a screenshot.
 */
/*
 * `window.history.replaceState`, not a router — the hook edits the URL rather than navigating, and
 * the reason is the expensive one: `@handle` is a dynamic segment, so `router.replace` would refetch
 * the RSC payload and re-run the route's server component to land on the page already rendered. The
 * hook's own doc carries it.
 *
 * Spying on the real jsdom method rather than replacing it keeps the assertion honest about the
 * whole address: a bare path would silently drop a query the URL was carrying.
 */
const replace = vi.spyOn(window.history, 'replaceState')

function goto(url: string) {
    window.history.replaceState(null, '', url)
    replace.mockClear()
}

function mount(props: Parameters<typeof useCanonicalEventSlug>[0]) {
    function Probe() {
        useCanonicalEventSlug(props)
        return null
    }
    return render(<Probe />)
}

beforeEach(() => {
    goto('/@ada/event/evt-1')
})

describe('while the answer is not known yet', () => {
    /** The event has not landed. Null is *unknown*, never *mismatched*. */
    it('does nothing when the canonical slug is null', () => {
        mount({ requested: 'bob', canonical: null, code: 'evt-1' })
        expect(replace).not.toHaveBeenCalled()
    })

    /** `event.channel.slug` is `nullableText`, so an empty string is the same absence. */
    it('does nothing when the canonical slug is empty', () => {
        mount({ requested: 'bob', canonical: '', code: 'evt-1' })
        expect(replace).not.toHaveBeenCalled()
    })

    it('does nothing when the canonical slug is undefined', () => {
        mount({ requested: 'bob', canonical: undefined, code: 'evt-1' })
        expect(replace).not.toHaveBeenCalled()
    })
})

describe('once the event has landed', () => {
    it('leaves an already-canonical URL alone', () => {
        mount({ requested: 'ada', canonical: 'ada', code: 'evt-1' })
        expect(replace).not.toHaveBeenCalled()
    })

    it('replaces a stale handle with the event own', () => {
        mount({ requested: 'ada-old', canonical: 'ada', code: 'evt-1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@ada/event/evt-1')
    })

    /**
     * ⚠ **The case this exists for, and the one the server used to let through.** The server
     * compared `toLowerCase()` on both sides, so `/@Ada` and `/@ada` both stood — two URLs for one
     * broadcast, which is the duplicate the redirect is there to fold. Exact comparison is also
     * `canonicalChannelRedirect`'s rule: the canonical spelling is the creator's own.
     */
    it('treats a casing difference as a mismatch', () => {
        mount({ requested: 'Ada', canonical: 'ada', code: 'evt-1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@ada/event/evt-1')
    })

    it('keeps the creator own capitals when the URL lowercased them', () => {
        mount({ requested: 'noraazima', canonical: 'Noraazima', code: 'evt-1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@Noraazima/event/evt-1')
    })

    /** The report route reuses the hook and only the builder differs. */
    it('follows the builder it is given', () => {
        mount({ requested: 'ada-old', canonical: 'ada', code: 'evt-1', path: eventReportPath })
        expect(replace).toHaveBeenCalledWith(null, '', '/@ada/event/evt-1/report')
    })

    /**
     * Both segments go through `encodeURIComponent` in `eventPath`. A code is minted by the backend
     * and a slug is chosen by its owner, so neither is guaranteed URL-safe — and a raw `?` would
     * silently truncate the path this hook is navigating to.
     */
    it('encodes what it builds', () => {
        mount({ requested: 'ada', canonical: 'a b', code: 'e?1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@a%20b/event/e%3F1')
    })
})

/**
 * ⚠ **The loop guard is the dependency list, not the comparison** — and that is the consequence of
 * editing the URL instead of navigating.
 *
 * With `router.replace` the correction fed back: the route re-rendered with `requested` equal to
 * `canonical`, so the comparison itself was the exit. A `replaceState` runs no navigation, so
 * `requested` stays what the server render passed and the comparison stays *true* for the life of
 * the mount. Nothing stops a second write except React declining to re-run an effect whose
 * dependencies have not moved — which holds only while every one of them is a primitive or a
 * module-level function. Add a value built inline at the call site and this starts writing on every
 * render, with no visible symptom beyond a history API called in a loop.
 */
describe('cannot loop', () => {
    it('writes once however often it re-renders', () => {
        function Probe({ requested }: { requested: string }) {
            useCanonicalEventSlug({ requested, canonical: 'ada', code: 'evt-1' })
            return null
        }
        const { rerender } = render(<Probe requested="ada-old" />)
        rerender(<Probe requested="ada-old" />)
        rerender(<Probe requested="ada-old" />)
        expect(replace).toHaveBeenCalledTimes(1)
    })

    /** The URL really did change, which is the half a call-count assertion cannot see. */
    it('leaves the address bar on the canonical handle', () => {
        mount({ requested: 'ada-old', canonical: 'ada', code: 'evt-1' })
        expect(window.location.pathname).toBe('/@ada/event/evt-1')
    })
})

/**
 * `replaceState` takes the **whole** address, so a bare path drops whatever the URL was carrying.
 * Nothing in this app writes a query onto an event URL, but plenty of things arrive with one — a
 * campaign tag, a referrer, `?startapp` — and losing it silently at the moment the handle is
 * corrected would be attribution disappearing on exactly the shared links this hook exists for.
 */
describe('keeps the rest of the URL', () => {
    it('carries the query across the correction', () => {
        goto('/@ada-old/event/evt-1?utm_source=poster&x=1')
        mount({ requested: 'ada-old', canonical: 'ada', code: 'evt-1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@ada/event/evt-1?utm_source=poster&x=1')
    })

    it('adds no stray question mark when there is no query', () => {
        goto('/@ada-old/event/evt-1')
        mount({ requested: 'ada-old', canonical: 'ada', code: 'evt-1' })
        expect(replace).toHaveBeenCalledWith(null, '', '/@ada/event/evt-1')
    })
})
