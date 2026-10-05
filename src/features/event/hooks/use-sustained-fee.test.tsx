// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { type SustainedFeeState, useSustainedFee } from './use-sustained-fee'

/**
 * **A recurring charge, and the clock that drives it.**
 *
 * The bug worth the whole file is legacy's: its `setInterval` effect lists `isOutOfStar` as a
 * dependency, so **crossing the fee threshold rebuilds the interval** — and a new interval starts
 * its countdown from zero. A viewer whose balance moves past the fee, which is every viewer who
 * sends a gift or gets charged, has their five minutes reset and is never billed again.
 *
 * Nothing about that is visible: the screen works, the room works, and the money simply does not
 * arrive.
 */
const purchaseSustainedFee = vi.hoisted(() => vi.fn())
const balance = vi.hoisted(() => ({ star: 100 }))
const me = vi.hoisted(() => ({ isPremium: false }))
const remote = vi.hoisted(() => ({
    rule: {
        enable: true,
        enableWithEventVisibility: null as string[] | null,
        enableWithLiveType: ['free'],
        fee: 1,
        chargeDuration: 5,
    } as unknown,
}))

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('@features/balance', () => ({ useBalance: () => balance }))
vi.mock('@features/channel', () => ({ useMyChannel: () => ({ isPremium: me.isPremium }) }))
vi.mock('@shared/lib/geo-provider', () => ({ useCountry: () => ({ country: 'VN' }) }))
vi.mock('@shared/lib/remote-config', () => ({
    useRemoteConfig: () => ({ event: {} }),
    resolveSustainedFeeRule: () => remote.rule,
}))
vi.mock('../api/unlock-api', async () => {
    const actual = await vi.importActual<typeof import('../api/unlock-api')>('../api/unlock-api')
    return { ...actual, unlockApi: { purchaseSustainedFee, purchase: vi.fn() } }
})

const event = eventDetailSchema.parse({
    code: 'evt-1',
    status: 'LIVE',
    paid_interactions: true,
    channel: { id: 'ch-1', slug: 'ada' },
})

function mount({ enabled = true } = {}) {
    const seen: { current: SustainedFeeState | null } = { current: null }
    function Probe() {
        seen.current = useSustainedFee({ event, enabled })
        return null
    }
    const view = render(<Probe />)
    /*
     * Re-renders the **same** probe. Rendering anything else would unmount the hook, which is
     * not "the balance changed" — it is the reader leaving, and the clock is supposed to stop.
     */
    const rerender = () => view.rerender(<Probe />)
    return { seen, view, rerender }
}

/** Flush promise callbacks without moving the clock — a charge resolves a tick after it fires. */
async function settle() {
    await act(async () => {
        await Promise.resolve()
    })
}

/** Advance the clock by whole minutes, flushing React between ticks. */
async function minutes(n: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(n * 60 * 1000)
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    purchaseSustainedFee.mockReset().mockResolvedValue(undefined)
    balance.star = 100
    remote.rule = {
        enable: true,
        enableWithEventVisibility: null,
        enableWithLiveType: ['free'],
        fee: 1,
        chargeDuration: 5,
    }
})

afterEach(() => {
    vi.useRealTimers()
})

describe('the clock', () => {
    it('charges once per interval, not on mount', async () => {
        mount()
        expect(purchaseSustainedFee).not.toHaveBeenCalled()

        await minutes(5)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(1)

        await minutes(5)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(2)
    })

    it('sends the configured fee and the streamer’s channel', async () => {
        mount()
        await minutes(5)
        expect(purchaseSustainedFee).toHaveBeenCalledWith({
            eventCode: 'evt-1',
            channelId: 'ch-1',
            fee: 1,
            accountId: 'acc-1',
        })
    })

    /**
     * ⚠ **The bug legacy has.** A balance that moves across the fee must not restart the
     * countdown. Here the reader drops below the fee at minute 3 and tops up at minute 4 — under
     * legacy's dependency list that is two fresh intervals, and the charge at minute 5 never
     * happens.
     */
    it('keeps its schedule while the balance moves across the threshold', async () => {
        const { rerender } = mount()

        await minutes(3)
        await act(async () => {
            balance.star = 0
            rerender()
        })
        await minutes(1)
        await act(async () => {
            balance.star = 100
            rerender()
        })
        await minutes(1)

        // Five minutes have passed in total, so exactly one charge is due.
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(1)
    })

    it('stops charging once the screen closes', async () => {
        const { view } = mount()
        await minutes(5)
        view.unmount()
        await minutes(15)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(1)
    })

    /* A reader looking at a paywall is not watching anything. */
    it('charges nothing when the caller has not asked for it', async () => {
        mount({ enabled: false })
        await minutes(20)
        expect(purchaseSustainedFee).not.toHaveBeenCalled()
    })

    it('charges nothing when no rule applies', async () => {
        remote.rule = null
        mount()
        await minutes(20)
        expect(purchaseSustainedFee).not.toHaveBeenCalled()
    })
})

describe('running out of Star', () => {
    it('blocks instead of charging, and does not retry until the next tick', async () => {
        balance.star = 0
        const { seen } = mount()

        await minutes(5)
        expect(purchaseSustainedFee).not.toHaveBeenCalled()
        expect(seen.current?.isOutOfStar).toBe(true)
    })

    /**
     * ⚠ Legacy charges the missed period **the moment the balance recovers** ("when a user tops up
     * stars while the popup is open, charge and hide the popup"). Only clearing the block let a
     * reader who ran dry watch the interrupted period for free.
     */
    it('collects the missed period on top-up, then keeps the clock', async () => {
        balance.star = 0
        const { seen, rerender } = mount()
        await minutes(5)
        expect(seen.current?.isOutOfStar).toBe(true)
        expect(purchaseSustainedFee).not.toHaveBeenCalled()

        await act(async () => {
            balance.star = 50
            rerender()
        })
        expect(seen.current?.isOutOfStar).toBe(false)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(1)

        await minutes(5)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(2)
    })
})

describe('a Premium reader', () => {
    afterEach(() => {
        me.isPremium = false
    })

    /*
     * The wall's own sentence promises Premium lets you keep watching. A reader who bought it in
     * another tab came back to the same wall — the bug this pins.
     */
    it('lifts an open wall the moment Premium arrives', async () => {
        balance.star = 0
        const { seen, rerender } = mount()
        await minutes(5)
        expect(seen.current?.isOutOfStar).toBe(true)

        await act(async () => {
            me.isPremium = true
            rerender()
        })
        expect(seen.current?.isOutOfStar).toBe(false)
    })

    it('is never walled for a period the balance cannot cover', async () => {
        me.isPremium = true
        balance.star = 0
        const { seen } = mount()
        await minutes(5)
        expect(seen.current?.isOutOfStar).toBe(false)
        expect(purchaseSustainedFee).not.toHaveBeenCalled()
    })

    /* B118: legacy charges Premium too, and whether it should is the backend's call. */
    it('is still charged when the balance can pay', async () => {
        me.isPremium = true
        balance.star = 50
        mount()
        await minutes(5)
        expect(purchaseSustainedFee).toHaveBeenCalledTimes(1)
    })
})

describe('a charge that fails', () => {
    /**
     * ⚠ Legacy's `catch (e) {}` is empty: the reader keeps watching for free, the streamer is not
     * paid, and neither of them is told.
     */
    it('is reported rather than swallowed', async () => {
        purchaseSustainedFee.mockRejectedValue(new Error('declined'))
        const { seen } = mount()

        await minutes(5)
        await settle()
        expect(seen.current?.hasFailed).toBe(true)
    })

    it('clears once a later charge succeeds', async () => {
        purchaseSustainedFee.mockRejectedValueOnce(new Error('declined'))
        const { seen } = mount()

        await minutes(5)
        await settle()
        expect(seen.current?.hasFailed).toBe(true)

        await minutes(5)
        await settle()
        expect(seen.current?.hasFailed).toBe(false)
    })
})

describe('the notices', () => {
    it('warns up front, then clears itself', async () => {
        const { seen } = mount()
        expect(seen.current?.notice).toMatchObject({ key: 'event_studio_fee_intro', fee: 1 })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_001)
        })
        expect(seen.current?.notice).toBeNull()
    })

    it('says so after each charge', async () => {
        const { seen } = mount()

        /*
         * Exactly one interval from mount, in one advance. The up-front warning expired at ten
         * seconds along the way, so whatever is on screen at five minutes is the charge's own
         * notice — and its own ten seconds have not started running down yet.
         *
         * Advancing *past* the interval instead (a second `minutes(5)` from an already-offset
         * clock) consumes the new notice's ten seconds too, and the assertion reads `null` for a
         * notice that was shown and correctly cleared. That is what this case did first.
         */
        await minutes(5)
        await settle()
        expect(seen.current?.notice).toMatchObject({
            key: 'event_studio_fee_charged',
            fee: 1,
            duration: 5,
        })
    })

    /**
     * Legacy's two `setTimeout`s are never cleared, so a reader who leaves inside ten seconds
     * gets a state update on an unmounted tree. Nothing here should warn.
     */
    it('leaves no timer behind on unmount', async () => {
        const { view } = mount()
        view.unmount()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(vi.getTimerCount()).toBe(0)
    })
})
