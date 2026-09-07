// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type TwoFaChange, useTwoFaChange } from './use-two-fa-change'

/**
 * Replacing a passcode the account knows — three screens and one `PATCH`.
 *
 * The claims worth pinning are all sequences, and the important one is the **asymmetry on failure**:
 * a refused credential sends the reader back to the gate and discards what they typed, where a
 * network failure or a 5xx keeps the replacement they chose and lets them retry. Getting that
 * backwards is invisible on screen — the first version of this file would have made a reader
 * re-choose a passcode because a server was briefly down.
 *
 * The rest: no request until the reader has finished the **hint** step (the comps' third screen, so
 * matching the two codes advances rather than writes), the passcode from the *gate* is what is sent
 * as the current one, and *Skip* sends `passcode_hint: ''` rather than omitting the field.
 */

const updatePasscode = vi.fn()

vi.mock('../api/two-fa-api', () => ({
    twoFaApi: {
        updatePasscode: (...a: unknown[]) => updatePasscode(...a),
        // Imported by `use-two-fa-flow`, which this hook borrows `PASSCODE_LENGTH` from.
        verifyPasscode: vi.fn(),
        recoverPasscode: vi.fn(),
        verifyResetOtp: vi.fn(),
        resetPasscode: vi.fn(),
    },
}))
vi.mock('../providers/auth-provider', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

function Probe({
    out,
    onChanged,
    currentPasscode,
}: {
    out: { flow?: TwoFaChange }
    onChanged: () => void
    currentPasscode: string | null
}) {
    out.flow = useTwoFaChange({ currentPasscode, onChanged })
    return null
}

function mount({ currentPasscode = '111111' }: { currentPasscode?: string | null } = {}) {
    const onChanged = vi.fn()
    const out: { flow?: TwoFaChange } = {}
    render(<Probe out={out} onChanged={onChanged} currentPasscode={currentPasscode} />)
    return {
        onChanged,
        get flow() {
            return out.flow as TwoFaChange
        },
    }
}

const rejection = (status: number) =>
    new ApiError({ message: `Request failed with status code ${status}`, status })

beforeEach(() => {
    updatePasscode.mockReset()
    updatePasscode.mockResolvedValue(undefined)
})

afterEach(cleanup)

/** Choose the replacement twice and land on the hint step. */
function chooseCode(harness: ReturnType<typeof mount>, code = '222222') {
    act(() => harness.flow.setPasscode(code))
    act(() => harness.flow.setConfirm(code))
}

describe('choosing the replacement', () => {
    it('advances on the sixth digit without a request', () => {
        const h = mount()
        act(() => h.flow.setPasscode('222222'))
        expect(h.flow.step).toBe('reenter')
        expect(updatePasscode).not.toHaveBeenCalled()
    })

    it('reports a mismatch without calling anything', () => {
        const h = mount()
        act(() => h.flow.setPasscode('222222'))
        act(() => h.flow.setConfirm('222223'))
        expect(h.flow.errorKey).toBe('auth_two_fa_mismatch')
        expect(h.flow.confirm).toBe('')
        expect(h.flow.passcode).toBe('222222')
        expect(updatePasscode).not.toHaveBeenCalled()
    })

    /**
     * **Matching the two codes advances, it does not write.** The comps put *Create hint* after the
     * confirmation, so the write is the hint step's two buttons. This is the assertion that keeps the
     * third screen from being skipped by a refactor.
     */
    it('reaches the hint step, still without a request', () => {
        const h = mount()
        act(() => h.flow.setPasscode('222222'))
        act(() => h.flow.setConfirm('222222'))
        expect(h.flow.step).toBe('hint')
        expect(updatePasscode).not.toHaveBeenCalled()
    })

    it('keeps the replacement when going back to edit it', () => {
        const h = mount()
        act(() => h.flow.setPasscode('222222'))
        act(() => h.flow.back())
        expect(h.flow.step).toBe('new')
        expect(h.flow.passcode).toBe('222222')
        expect(h.flow.confirm).toBe('')
    })

    it('goes back from the hint step to the confirmation', () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.back())
        expect(h.flow.step).toBe('reenter')
        expect(h.flow.confirm).toBe('')
        expect(h.flow.passcode).toBe('222222')
    })

    it("caps the hint at the write's own maximum", () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('x'.repeat(80)))
        expect(h.flow.hint).toHaveLength(50)
    })
})

describe('the write', () => {
    /**
     * `passcode` is the **current** one and `new_passcode` the replacement — legacy's spelling, and
     * one a typo would reverse silently into "your current passcode is wrong".
     */
    it('sends the gate\u2019s passcode as the current one', async () => {
        const h = mount({ currentPasscode: '111111' })
        chooseCode(h, '222222')
        act(() => h.flow.setHint('birthday'))
        await act(async () => h.flow.finish(true))
        expect(updatePasscode).toHaveBeenCalledWith(
            { passcode: '111111', newPasscode: '222222', passcodeHint: 'birthday' },
            'acc-1',
        )
        expect(h.onChanged).toHaveBeenCalledTimes(1)
    })

    /** Legacy's *Skip* posts `''`. An omitted field is not the same value to a backend that later
     * prints the hint, and this is what keeps the two apart. */
    it('sends an empty hint when skipped', async () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('typed then skipped'))
        await act(async () => h.flow.finish(false))
        expect(updatePasscode).toHaveBeenCalledWith(
            expect.objectContaining({ passcodeHint: '' }),
            'acc-1',
        )
    })

    it('trims the hint it keeps', async () => {
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('  mum  '))
        await act(async () => h.flow.finish(true))
        expect(updatePasscode).toHaveBeenCalledWith(
            expect.objectContaining({ passcodeHint: 'mum' }),
            'acc-1',
        )
    })

    /** Nothing can be written without a proved passcode — the gate is not optional. */
    it('writes nothing without a verified passcode', async () => {
        const h = mount({ currentPasscode: null })
        chooseCode(h)
        await act(async () => h.flow.finish(true))
        expect(updatePasscode).not.toHaveBeenCalled()
        expect(h.onChanged).not.toHaveBeenCalled()
    })

    /** The latch is a ref, not `busy`: two presses in one tick both read `false` and both fire. */
    it('fires once when the button is pressed twice', async () => {
        const h = mount()
        chooseCode(h)
        await act(async () => {
            h.flow.finish(false)
            h.flow.finish(false)
        })
        expect(updatePasscode).toHaveBeenCalledTimes(1)
    })
})

describe('when the write is refused', () => {
    /**
     * A 4xx means the current passcode was refused seconds after `verify/` accepted it — the two
     * endpoints disagreeing, or a change on another device. Pressing the same button again cannot fix
     * that, so the flow returns to the gate and everything typed goes with it.
     */
    it('asks for the passcode again and discards the replacement', async () => {
        updatePasscode.mockRejectedValue(rejection(401))
        const h = mount()
        chooseCode(h)
        await act(async () => h.flow.finish(false))
        expect(h.flow.needsReauth).toBe(true)
        expect(h.flow.errorKey).toBe('auth_two_fa_wrong')
        expect(h.flow.step).toBe('new')
        expect(h.flow.passcode).toBe('')
        expect(h.onChanged).not.toHaveBeenCalled()
    })

    /**
     * The other half of the asymmetry: a server fault keeps the replacement, the hint and the step,
     * so pressing the button again is the retry.
     */
    it('keeps everything and does not re-gate on a server fault', async () => {
        updatePasscode.mockRejectedValue(rejection(502))
        const h = mount()
        chooseCode(h)
        act(() => h.flow.setHint('birthday'))
        await act(async () => h.flow.finish(true))
        expect(h.flow.needsReauth).toBe(false)
        expect(h.flow.errorKey).toBe('auth_server_error')
        expect(h.flow.step).toBe('hint')
        expect(h.flow.passcode).toBe('222222')
        expect(h.flow.hint).toBe('birthday')
    })

    it('retries from the same step once the server is back', async () => {
        updatePasscode.mockRejectedValueOnce(rejection(502)).mockResolvedValueOnce(undefined)
        const h = mount()
        chooseCode(h)
        await act(async () => h.flow.finish(false))
        await act(async () => h.flow.finish(false))
        expect(updatePasscode).toHaveBeenCalledTimes(2)
        expect(h.onChanged).toHaveBeenCalledTimes(1)
    })

    it('clears the refusal when the gate is passed again', async () => {
        updatePasscode.mockRejectedValue(rejection(422))
        const h = mount()
        chooseCode(h)
        await act(async () => h.flow.finish(false))
        expect(h.flow.needsReauth).toBe(true)
        act(() => h.flow.restart())
        expect(h.flow.needsReauth).toBe(false)
        expect(h.flow.errorKey).toBeNull()
    })
})
