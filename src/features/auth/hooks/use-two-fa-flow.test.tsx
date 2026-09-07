// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type TwoFaFlow, useTwoFaFlow } from './use-two-fa-flow'

/**
 * The **recovery chain** behind *Forgot passcode?*, which is four network calls and one local
 * comparison in a fixed order. Tested through the hook rather than the rendered dialog because every
 * claim worth pinning is a *sequence*:
 *
 * - the emailed OTP survives three screens and is what authorises the write,
 * - a passcode mismatch costs no request and does not spend that OTP,
 * - choosing a new passcode makes **no** call — the write happens once, at the end,
 * - *Skip* sends `passcode_hint: ''` rather than omitting the field,
 * - and a completed reset lands back on `enter`, not on the caller's `onVerified`.
 *
 * None of those is visible in a tree, and the last one is a money bug if it goes the other way: a
 * passcode `verify/` never checked would be attached to a withdrawal.
 */

const verifyPasscode = vi.fn()
const recoverPasscode = vi.fn()
const verifyResetOtp = vi.fn()
const resetPasscode = vi.fn()

vi.mock('../api/two-fa-api', () => ({
    twoFaApi: {
        verifyPasscode: (...a: unknown[]) => verifyPasscode(...a),
        recoverPasscode: (...a: unknown[]) => recoverPasscode(...a),
        verifyResetOtp: (...a: unknown[]) => verifyResetOtp(...a),
        resetPasscode: (...a: unknown[]) => resetPasscode(...a),
    },
}))
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

/** Assigns the hook's return value out, so a test can drive it the way the dialog does. */
function Probe({
    onVerified,
    out,
}: {
    onVerified: (code: string) => void
    out: { flow?: TwoFaFlow }
}) {
    out.flow = useTwoFaFlow(onVerified)
    return null
}

function mount() {
    const onVerified = vi.fn()
    const out: { flow?: TwoFaFlow } = {}
    render(<Probe onVerified={onVerified} out={out} />)
    // Non-null through a getter: every `act` re-renders and replaces the object.
    return {
        onVerified,
        get flow() {
            return out.flow as TwoFaFlow
        },
    }
}

const rejection = (status: number) =>
    new ApiError({ message: `Request failed with status code ${status}`, status })

beforeEach(() => {
    for (const fn of [verifyPasscode, verifyResetOtp, resetPasscode]) {
        fn.mockReset()
        fn.mockResolvedValue(undefined)
    }
    recoverPasscode.mockReset()
    // `recover/` answers with the address it mailed the code to — see `recoveryEmailOf`.
    recoverPasscode.mockResolvedValue('creator@tevi.com')
})
afterEach(cleanup)

/** Walk from the root step to the hint step with a known code and passcode. */
async function reachHintStep(probe: ReturnType<typeof mount>, code = '111111', pass = '246810') {
    await act(async () => probe.flow.forgot())
    await act(async () => probe.flow.setRecoveryCode(code))
    await act(async () => probe.flow.setPasscode(pass))
    await act(async () => probe.flow.setConfirm(pass))
}

describe('useTwoFaFlow — starting the recovery chain', () => {
    it('emails a code and opens the resend countdown', async () => {
        const probe = mount()
        expect(probe.flow.step).toBe('enter')

        await act(async () => probe.flow.forgot())

        expect(recoverPasscode).toHaveBeenCalledTimes(1)
        expect(recoverPasscode).toHaveBeenCalledWith('acc-1')
        expect(probe.flow.step).toBe('recovery')
        // Shut for 30 seconds, so the control is a countdown rather than a way to mail six emails.
        expect(probe.flow.resendIn).toBe(30)
    })

    /** A failed send is not a wrong code, and must not be reported as one. */
    it('stays on the root step when the email cannot be sent', async () => {
        recoverPasscode.mockRejectedValue(rejection(400))
        const probe = mount()

        await act(async () => probe.flow.forgot())

        expect(probe.flow.step).toBe('enter')
        expect(probe.flow.errorKey).toBe('auth_two_fa_recovery_failed')
    })

    it('refuses to resend while the countdown is running', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        expect(recoverPasscode).toHaveBeenCalledTimes(1)

        await act(async () => probe.flow.resend())

        expect(recoverPasscode).toHaveBeenCalledTimes(1)
    })
})

describe('useTwoFaFlow — the recovery address', () => {
    /**
     * `recover/` answers with the inbox it used, and the step names it. An account can hold more than
     * one address; the generic "your recovery email address" leaves somebody checking the wrong one and
     * pressing Resend at a code that already arrived.
     */
    it('carries the address the backend reported', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        expect(probe.flow.recoveryEmail).toBe('creator@tevi.com')
    })

    /** And withholds it when the response did not say — the copy falls back to legacy's sentence. */
    it('stays null when the response names none', async () => {
        recoverPasscode.mockResolvedValue(null)
        const probe = mount()
        await act(async () => probe.flow.forgot())
        expect(probe.flow.step).toBe('recovery')
        expect(probe.flow.recoveryEmail).toBeNull()
    })

    /** A resend re-reads it: the backend may have mailed a different address the second time. */
    it('re-reads it on a resend', async () => {
        vi.useFakeTimers()
        try {
            const probe = mount()
            await act(async () => probe.flow.forgot())
            for (let i = 0; i < 30; i += 1) {
                await act(async () => {
                    vi.advanceTimersByTime(1000)
                })
            }
            recoverPasscode.mockResolvedValue('other@tevi.com')

            await act(async () => probe.flow.resend())

            expect(probe.flow.recoveryEmail).toBe('other@tevi.com')
        } finally {
            vi.useRealTimers()
        }
    })

    /** Gone on teardown, so a reopened dialog cannot print the previous session's inbox. */
    it('is cleared by a restart', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        await act(async () => probe.flow.restart())
        expect(probe.flow.recoveryEmail).toBeNull()
    })
})

describe('useTwoFaFlow — the code runs out', () => {
    /**
     * **The countdown is the lifetime, not just the resend gate** (B88, answered). So past zero the
     * server has already dropped the code, and sending it would earn a 4xx that reads as "wrong code"
     * — which is the failure that has somebody re-checking digits that were right.
     */
    it('refuses to send a code after the countdown', async () => {
        vi.useFakeTimers()
        try {
            const probe = mount()
            await act(async () => probe.flow.forgot())
            expect(probe.flow.isCodeExpired).toBe(false)

            // Thirty ticks of the one-timeout-per-second countdown.
            for (let i = 0; i < 30; i += 1) {
                await act(async () => {
                    vi.advanceTimersByTime(1000)
                })
            }
            expect(probe.flow.resendIn).toBe(0)
            expect(probe.flow.isCodeExpired).toBe(true)

            await act(async () => probe.flow.setRecoveryCode('111111'))

            expect(verifyResetOtp).not.toHaveBeenCalled()
            expect(probe.flow.step).toBe('recovery')
        } finally {
            vi.useRealTimers()
        }
    })

    /** And a resend brings it back to life — the same number opens both. */
    it('revives on a resend', async () => {
        vi.useFakeTimers()
        try {
            const probe = mount()
            await act(async () => probe.flow.forgot())
            for (let i = 0; i < 30; i += 1) {
                await act(async () => {
                    vi.advanceTimersByTime(1000)
                })
            }
            expect(probe.flow.isCodeExpired).toBe(true)

            await act(async () => probe.flow.resend())

            expect(recoverPasscode).toHaveBeenCalledTimes(2)
            expect(probe.flow.isCodeExpired).toBe(false)
            expect(probe.flow.resendIn).toBe(30)
        } finally {
            vi.useRealTimers()
        }
    })

    /** Never true off the code step — the passcode boxes have no countdown behind them. */
    it('is never expired on the other steps', async () => {
        const probe = mount()
        expect(probe.flow.isCodeExpired).toBe(false)
        await reachHintStep(probe)
        expect(probe.flow.isCodeExpired).toBe(false)
    })
})

describe('useTwoFaFlow — the emailed code', () => {
    it('checks it on the sixth digit and moves on', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())

        await act(async () => probe.flow.setRecoveryCode('12345'))
        expect(verifyResetOtp).not.toHaveBeenCalled()

        await act(async () => probe.flow.setRecoveryCode('123456'))
        expect(verifyResetOtp).toHaveBeenCalledWith('123456', 'acc-1')
        expect(probe.flow.step).toBe('new')
    })

    /**
     * Verified **early**, which is the whole reason it is its own call: without it the reader would
     * choose a passcode twice and write a hint before being told the code was wrong.
     */
    it('holds the reader on the code step when it is rejected, and clears it', async () => {
        verifyResetOtp.mockRejectedValue(rejection(422))
        const probe = mount()
        await act(async () => probe.flow.forgot())

        await act(async () => probe.flow.setRecoveryCode('000000'))

        expect(probe.flow.step).toBe('recovery')
        expect(probe.flow.recoveryCode).toBe('')
        expect(probe.flow.errorKey).toBe('auth_two_fa_otp_invalid')
    })
})

describe('useTwoFaFlow — choosing the new passcode', () => {
    /** Nothing to check it against, so nothing is sent. The write happens once, with the hint. */
    it('makes no request when the new passcode is chosen', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        await act(async () => probe.flow.setRecoveryCode('111111'))

        await act(async () => probe.flow.setPasscode('246810'))

        expect(probe.flow.step).toBe('reenter')
        expect(verifyPasscode).not.toHaveBeenCalled()
        expect(resetPasscode).not.toHaveBeenCalled()
    })

    /**
     * **A mismatch costs nothing** — no request, and the OTP is untouched, so the reader can simply
     * type it again rather than asking for another email.
     */
    it('reports a mismatch locally and keeps the chain alive', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        await act(async () => probe.flow.setRecoveryCode('111111'))
        await act(async () => probe.flow.setPasscode('246810'))

        await act(async () => probe.flow.setConfirm('999999'))

        expect(probe.flow.step).toBe('reenter')
        expect(probe.flow.confirm).toBe('')
        // Not `auth_two_fa_wrong`, which is legacy's string here: it is not a code and it is not wrong.
        expect(probe.flow.errorKey).toBe('auth_two_fa_mismatch')
        expect(resetPasscode).not.toHaveBeenCalled()
        expect(verifyResetOtp).toHaveBeenCalledTimes(1)

        await act(async () => probe.flow.setConfirm('246810'))
        expect(probe.flow.step).toBe('hint')
    })
})

describe('useTwoFaFlow — writing the new passcode', () => {
    /**
     * **The OTP from three screens ago is what authorises the write.** Losing it means the reset 4xxs
     * at the last step with the passcode already chosen — the failure this assertion exists to catch.
     */
    it('sends the passcode, the hint and the original code', async () => {
        const probe = mount()
        await reachHintStep(probe, '111111', '246810')

        await act(async () => probe.flow.setHint('  my cat  '))
        await act(async () => probe.flow.finish(true))

        expect(resetPasscode).toHaveBeenCalledWith(
            { passcode: '246810', passcodeHint: 'my cat', otp: '111111' },
            'acc-1',
        )
    })

    /** *Skip* is a real answer: it writes the passcode with an **empty** hint, never an omitted field. */
    it('sends an empty hint for Skip rather than omitting it', async () => {
        const probe = mount()
        await reachHintStep(probe)
        await act(async () => probe.flow.setHint('typed then skipped'))

        await act(async () => probe.flow.finish(false))

        expect(resetPasscode.mock.calls[0][0].passcodeHint).toBe('')
        expect('passcodeHint' in resetPasscode.mock.calls[0][0]).toBe(true)
    })

    /**
     * **Back to `enter`, never straight to `onVerified`.** `reset/` returns no verification, so handing
     * the new passcode to the caller would attach a code `verify/` never checked to a withdrawal.
     */
    it('returns to the root step and says so, without verifying anything', async () => {
        const probe = mount()
        await reachHintStep(probe)

        await act(async () => probe.flow.finish(false))

        expect(probe.flow.step).toBe('enter')
        expect(probe.flow.justReset).toBe(true)
        expect(probe.onVerified).not.toHaveBeenCalled()
        // And the chain's state is gone — a spent OTP must not be re-presentable.
        expect(probe.flow.recoveryCode).toBe('')
        expect(probe.flow.passcode).toBe('')
    })

    it('drops the note on the first keystroke', async () => {
        const probe = mount()
        await reachHintStep(probe)
        await act(async () => probe.flow.finish(false))

        await act(async () => probe.flow.setPasscode('1'))

        expect(probe.flow.justReset).toBe(false)
    })

    /** A failed write is not a wrong code, and the reader must be able to try again. */
    it('keeps the reader on the hint step when the write fails', async () => {
        resetPasscode.mockRejectedValue(rejection(400))
        const probe = mount()
        await reachHintStep(probe)

        await act(async () => probe.flow.finish(false))

        expect(probe.flow.step).toBe('hint')
        expect(probe.flow.errorKey).toBe('auth_two_fa_reset_failed')

        resetPasscode.mockResolvedValue(undefined)
        await act(async () => probe.flow.finish(false))
        expect(probe.flow.step).toBe('enter')
    })

    /**
     * Two presses in the same tick — *Skip* double-clicked. `busy` is last render's, so only the ref
     * stops the second, and on this endpoint a replay spends an OTP the reader cannot re-obtain
     * without another email.
     */
    it('writes once when Skip is pressed twice in one tick', async () => {
        let release = () => {}
        resetPasscode.mockImplementation(
            () =>
                new Promise<void>(done => {
                    release = () => done()
                }),
        )
        const probe = mount()
        await reachHintStep(probe)

        await act(async () => {
            probe.flow.finish(false)
            probe.flow.finish(false)
        })

        expect(resetPasscode).toHaveBeenCalledTimes(1)
        release()
    })
})

describe('useTwoFaFlow — going back', () => {
    it('offers no way back from the root step', () => {
        const probe = mount()
        expect(probe.flow.canGoBack).toBe(false)
    })

    /**
     * **Back from `reenter` keeps the new passcode on screen.** That is the point of the button here —
     * legacy holds three separate arrays for exactly this, and sharing one slot would make Back a way
     * to lose what was just typed.
     */
    it('keeps the chosen passcode when stepping back to change it', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        await act(async () => probe.flow.setRecoveryCode('111111'))
        await act(async () => probe.flow.setPasscode('246810'))
        await act(async () => probe.flow.setConfirm('2468'))

        await act(async () => probe.flow.back())

        expect(probe.flow.step).toBe('new')
        expect(probe.flow.passcode).toBe('246810')
        expect(probe.flow.confirm).toBe('')
    })

    /** Walking all the way back abandons the chain, OTP included. */
    it('drops the code when it returns to the root step', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        // A partial code, so the step is still `recovery` — six digits would have verified and moved on.
        await act(async () => probe.flow.setRecoveryCode('1111'))

        await act(async () => probe.flow.back())

        expect(probe.flow.step).toBe('enter')
        expect(probe.flow.recoveryCode).toBe('')
        expect(probe.flow.canGoBack).toBe(false)
    })

    /**
     * **Stepping back onto the code step leaves it usable.** Keeping the six verified digits in the
     * boxes makes it inert — the transition fires on completion, so nothing happens until one is
     * deleted and retyped. Legacy clears nothing and has exactly that dead end.
     */
    it('clears the emailed code when it steps back onto that step', async () => {
        const probe = mount()
        await act(async () => probe.flow.forgot())
        await act(async () => probe.flow.setRecoveryCode('111111'))
        expect(probe.flow.step).toBe('new')

        await act(async () => probe.flow.back())

        expect(probe.flow.step).toBe('recovery')
        expect(probe.flow.recoveryCode).toBe('')
    })

    /** And from mid-chain it unwinds one step at a time, all the way out. */
    it('unwinds the whole chain step by step', async () => {
        const probe = mount()
        await reachHintStep(probe)
        expect(probe.flow.step).toBe('hint')

        for (const expected of ['reenter', 'new', 'recovery', 'enter']) {
            await act(async () => probe.flow.back())
            expect(probe.flow.step).toBe(expected)
        }
        expect(probe.flow.canGoBack).toBe(false)
    })
})
