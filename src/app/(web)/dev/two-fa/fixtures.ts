import type { TwoFaFlow, TwoFaStep } from '@features/auth/dev'

/**
 * A `TwoFaFlow` parked on one step, for the harness.
 *
 * **A literal, not `useTwoFaFlow` driven by stubs.** The real machine advances on network answers —
 * `verify/`, `recover/`, `reset/verify-otp/`, `reset/` — so driving it in a page would mean four fake
 * endpoints, and the thing under review is the *view*. The seam is `TwoFaDialogBody` taking the flow
 * as a value; this is the value.
 *
 * Every action is a no-op. The preview is for looking, and a Back that actually moved would leave the
 * page showing a step its own heading disagrees with.
 */
export function flowAt(step: TwoFaStep, overrides: Partial<TwoFaFlow> = {}): TwoFaFlow {
    const noop = () => {}
    return {
        step,
        passcode: step === 'reenter' || step === 'hint' ? '246810' : '',
        setPasscode: noop,
        recoveryCode: step === 'recovery' ? '' : '111111',
        setRecoveryCode: noop,
        confirm: '',
        setConfirm: noop,
        hint: step === 'hint' ? 'my first pet' : '',
        setHint: noop,
        recoveryEmail: 'creator@tevi.com',
        resendIn: step === 'recovery' ? 30 : 0,
        isCodeExpired: false,
        errorKey: null,
        busy: false,
        justReset: false,
        canGoBack: step !== 'enter',
        back: noop,
        forgot: noop,
        resend: noop,
        finish: noop,
        restart: noop,
        ...overrides,
    }
}
