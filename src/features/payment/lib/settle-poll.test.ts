import { describe, expect, it, vi } from 'vitest'
import type { SettleOutcome } from '../api/types'
import { runSettlePoll, SETTLE_MAX_ATTEMPTS, settleDelay, settleWindowMs } from './settle-poll'

/** Records what was waited for instead of waiting. */
function fakeSleep() {
    const waited: number[] = []
    return {
        waited,
        sleep: (ms: number) => {
            waited.push(ms)
            return Promise.resolve()
        },
    }
}

const PENDING: SettleOutcome = { status: 'pending' }

describe('settleDelay', () => {
    it('backs off and then runs out', () => {
        expect(settleDelay(0)).toBe(2000)
        expect(settleDelay(5)).toBe(4000)
        expect(settleDelay(10)).toBe(8000)
        expect(settleDelay(SETTLE_MAX_ATTEMPTS)).toBeNull()
        expect(settleDelay(-1)).toBeNull()
    })

    it('spans a window a screen can honestly describe', () => {
        expect(settleWindowMs()).toBe(54_000)
    })
})

describe('runSettlePoll', () => {
    it('checks immediately and returns the first real answer', async () => {
        const { sleep, waited } = fakeSleep()
        const check = vi.fn(
            async () => ({ status: 'settled', purchaseType: 'star' }) as SettleOutcome,
        )

        await expect(runSettlePoll({ check, sleep })).resolves.toEqual({
            status: 'settled',
            purchaseType: 'star',
        })
        expect(check).toHaveBeenCalledTimes(1)
        expect(waited).toEqual([])
    })

    it('keeps asking while the answer is pending, and reports each attempt', async () => {
        const { sleep, waited } = fakeSleep()
        const answers: SettleOutcome[] = [
            PENDING,
            PENDING,
            { status: 'settled', purchaseType: null },
        ]
        const onPending = vi.fn()

        const result = await runSettlePoll({
            check: async attempt => answers[attempt] ?? PENDING,
            sleep,
            onPending,
        })

        expect(result).toEqual({ status: 'settled', purchaseType: null })
        expect(onPending.mock.calls.map(([attempt]) => attempt)).toEqual([0, 1])
        expect(waited).toEqual([2000, 2000])
    })

    it('is exhausted rather than failed when the schedule runs out', async () => {
        const { sleep, waited } = fakeSleep()
        const check = vi.fn(async () => PENDING)

        await expect(runSettlePoll({ check, sleep })).resolves.toEqual({ status: 'exhausted' })
        expect(check).toHaveBeenCalledTimes(SETTLE_MAX_ATTEMPTS + 1)
        expect(waited).toHaveLength(SETTLE_MAX_ATTEMPTS)
    })

    it('returns a refusal as an outcome, not by throwing', async () => {
        const { sleep } = fakeSleep()
        await expect(
            runSettlePoll({
                check: async () => ({ status: 'rejected', text: 'Card declined', code: 'PM0007' }),
                sleep,
            }),
        ).resolves.toMatchObject({ status: 'rejected', text: 'Card declined' })
    })

    it('rides out a few transport failures — a 502 says nothing about the payment', async () => {
        const { sleep } = fakeSleep()
        let calls = 0
        const check = async (): Promise<SettleOutcome> => {
            calls += 1
            if (calls <= 3) throw new Error('boom')
            return { status: 'settled', purchaseType: 'star' }
        }

        await expect(runSettlePoll({ check, sleep })).resolves.toMatchObject({ status: 'settled' })
        expect(calls).toBe(4)
    })

    it('gives up when the failures do not stop', async () => {
        const { sleep } = fakeSleep()
        await expect(
            runSettlePoll({
                check: async () => {
                    throw new Error('outage')
                },
                sleep,
                maxTransportErrors: 2,
            }),
        ).rejects.toThrow('outage')
    })

    it('stops on abort without reporting an outcome', async () => {
        const controller = new AbortController()
        const check = vi.fn(async () => {
            controller.abort()
            return PENDING
        })

        await expect(
            runSettlePoll({ check, sleep: () => Promise.resolve(), signal: controller.signal }),
        ).resolves.toEqual({ status: 'aborted' })
        expect(check).toHaveBeenCalledTimes(1)
    })

    it('does not poll while the page is inactive', async () => {
        const { sleep } = fakeSleep()
        const gate: { release: () => void } = { release: () => {} }
        const active = new Promise<void>(resolve => {
            gate.release = resolve
        })
        const check = vi.fn(
            async () => ({ status: 'settled', purchaseType: null }) as SettleOutcome,
        )

        const promise = runSettlePoll({ check, sleep, waitUntilActive: () => active })

        await Promise.resolve()
        expect(check).not.toHaveBeenCalled()
        gate.release()
        await expect(promise).resolves.toMatchObject({ status: 'settled' })
    })
})
