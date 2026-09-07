// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxType } from '../api/types'
import { useInboxTypes } from './use-inbox-types'

/**
 * The filter sheet's draft.
 *
 * This file exists because of one reported bug: **open the filter, switch Live Streaming on, and
 * Money Updates turns itself off.** Nothing about the old code looked wrong — the switches rendered
 * in the right positions, and they went on rendering right up until the first press — so it took a
 * user to find it and it needs a test to stay found.
 *
 * The cause was a draft modelled as "the set of ids that are on", seeded by an effect, with `null`
 * for "not seeded yet". `toggle` built its next set from `previous ?? []`, so a press while the
 * draft was still `null` produced a set holding only the id just pressed and every server-on row
 * silently went off. What made it reachable on almost every use was the second half: the seeding
 * effect keyed on a fingerprint of the *server's* values, and a disabled query keeps its cached
 * data — so after the first close the fingerprint never changed again and the draft stayed `null`
 * for every reopen.
 *
 * Both are unrepresentable now (the draft holds only what the reader touched).
 *
 * ## Which test actually catches it, verified rather than assumed
 *
 * The old shape was restored and these tests run against it. **One** failed: *still leaves the
 * others alone after the sheet is closed and reopened*. The plain single-toggle test **passed** —
 * because on a genuine first open the seeding effect does fire (the fingerprint changes from `''`
 * to the real one), so the draft is seeded and `toggle` behaves.
 *
 * So the trigger is narrower than the report suggests: the sheet has to have been opened once
 * before in the same session, which is what leaves the types query holding data and the fingerprint
 * unchanging. A first open is only vulnerable inside the single frame between the data landing and
 * the effect running, which no human hits.
 *
 * The single-toggle test is kept regardless. It is the assertion the *feature* owes — one switch
 * moves one switch — and it should not depend on which of the two defects happened to break it.
 */

const authed = vi.hoisted(() => ({ value: true }))
const getTypes = vi.hoisted(() => vi.fn())
const updateTypes = vi.hoisted(() => vi.fn())
const forgetInboxCache = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: 'acc-1', isAuthenticated: authed.value }),
}))
vi.mock('@shared/i18n/use-translation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../api/notification-api', () => ({
    notificationApi: {
        getTypes: (...a: unknown[]) => getTypes(...a),
        updateTypes: (...a: unknown[]) => updateTypes(...a),
    },
    forgetInboxCache: (...a: unknown[]) => forgetInboxCache(...a),
    notificationKeys: {
        inbox: (id: string | null) => ['notification', 'inbox', id ?? 'anon'],
        types: (id: string | null) => ['notification', 'types', id ?? 'anon'],
    },
}))

/** The four rows the reporter had on screen: only Money is on. */
const CREATORS = 'creators'
const POST = 'post'
const LIVE = 'live'
const MONEY = 'money'

function types(on: readonly string[] = [MONEY]): InboxType[] {
    return [CREATORS, POST, LIVE, MONEY].map(id => ({
        id,
        name: id,
        turn_on: on.includes(id),
        icon_metadata: null,
        metadata: null,
    })) as InboxType[]
}

function renderHook() {
    let api!: ReturnType<typeof useInboxTypes>
    function Probe({ open }: { open: boolean }) {
        api = useInboxTypes({ open })
        return null
    }
    // `staleTime: Infinity` so a reopen reads the cache without refetching — which is exactly the
    // state the old seeding effect could not recover from.
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    })
    function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    const view = render(
        <Wrapper>
            <Probe open />
        </Wrapper>,
    )
    return {
        read: () => api,
        act: (fn: (a: typeof api) => void) => act(() => fn(api)),
        setOpen: (open: boolean) =>
            act(() => {
                view.rerender(
                    <Wrapper>
                        <Probe open={open} />
                    </Wrapper>,
                )
            }),
    }
}

/** All four switches, as the sheet would draw them. */
function positions(api: ReturnType<typeof useInboxTypes>) {
    return {
        [CREATORS]: api.isOn(CREATORS),
        [POST]: api.isOn(POST),
        [LIVE]: api.isOn(LIVE),
        [MONEY]: api.isOn(MONEY),
    }
}

beforeEach(() => {
    authed.value = true
    getTypes.mockReset().mockResolvedValue(types())
    updateTypes.mockReset().mockResolvedValue({})
    forgetInboxCache.mockReset().mockResolvedValue(undefined)
})

describe('useInboxTypes', () => {
    it('draws the switches from the server before anything is touched', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))
        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: false,
            money: true,
        })
        expect(h.read().isDirty).toBe(false)
    })

    /** **The reported bug.** */
    it('leaves every other switch alone when one is toggled', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(LIVE))

        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: true,
            // The assertion the old shape failed: Money was on and nobody touched it.
            money: true,
        })
    })

    /**
     * **The half that made it reachable.** The first open seeded the draft and worked; every reopen
     * after it did not, because the query keeps its data while disabled so the fingerprint the
     * seeding effect watched never changed again.
     */
    it('still leaves the others alone after the sheet is closed and reopened', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(LIVE))
        h.setOpen(false)
        h.setOpen(true)
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        // Reopening starts from the server again — the draft is discarded, not carried over.
        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: false,
            money: true,
        })
        expect(h.read().isDirty).toBe(false)

        h.act(a => a.toggle(LIVE))
        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: true,
            money: true,
        })
    })

    it('turns a server-on row off without disturbing the rest', async () => {
        getTypes.mockResolvedValue(types([LIVE, MONEY]))
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(MONEY))

        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: true,
            money: false,
        })
    })

    it('is not dirty again once a switch is flipped back', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(LIVE))
        expect(h.read().isDirty).toBe(true)

        h.act(a => a.toggle(LIVE))
        expect(h.read().isDirty).toBe(false)
        expect(positions(h.read())).toEqual({
            creators: false,
            post: false,
            live: false,
            money: true,
        })
    })

    /** The endpoint takes the whole list, so it gets the whole list — under its *other* spelling. */
    it('sends every row, with `active`, on save', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(LIVE))
        h.act(a => a.save())
        await waitFor(() => expect(updateTypes).toHaveBeenCalled())

        expect(updateTypes.mock.calls[0][0]).toEqual([
            { id: CREATORS, active: false },
            { id: POST, active: false },
            { id: LIVE, active: true },
            { id: MONEY, active: true },
        ])
    })

    it('sends nothing when nothing changed', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.save())

        expect(updateTypes).not.toHaveBeenCalled()
    })

    /** A filter change alters which rows the inbox returns, so its stored validators must go too —
     *  or a conditional GET is answered 304 with the pre-filter list (**B72**). */
    it('drops the inbox ETag cache after a successful save', async () => {
        const h = renderHook()
        await waitFor(() => expect(h.read().types).toHaveLength(4))

        h.act(a => a.toggle(LIVE))
        h.act(a => a.save())
        await waitFor(() => expect(forgetInboxCache).toHaveBeenCalledWith('acc-1'))
    })

    it('never asks for the types while the sheet is closed', async () => {
        const h = renderHook()
        await waitFor(() => expect(getTypes).toHaveBeenCalledTimes(1))
        h.setOpen(false)
        expect(getTypes).toHaveBeenCalledTimes(1)
    })
})
