'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import type { TeviIconNameFilled } from '@shared/ui/icon-names'
import {
    HINT_MAX_LENGTH,
    PASSCODE_LENGTH,
    type TwoFaFlow,
    type TwoFaStep,
} from '../../hooks/use-two-fa-flow'
import { AUTH_FIELD_CLASS } from '../auth-fields'
import { OtpInput } from '../otp-input'
import { PasswordStepHeader as StepHeader } from '../password/password-step-header'

/**
 * The passcode gate, **on the page rather than in a dialog**.
 *
 * `/settings/two-step-verification` for an account that has the factor on opens on *Enter passcode*
 * — comps `1077:81293` (empty) and `1077:82781` (refused) — and the three management rows appear only
 * behind it. So the screen is locked, not the individual actions.
 *
 * That is the opposite of `CLAUDE.md`'s "screens gate the action, never the route", and deliberately:
 * that rule is about **sessions** — a signed-out visitor must always reach a page and be shown what
 * it is for, because a redirect loses the URL and tells them nothing. This is a **re-auth** on a page
 * whose entire content is the controls for a credential the reader has already proved they hold. There
 * is nothing here to show someone who cannot pass it, and the three rows behind it each need the
 * passcode as a field anyway. A guest still gets the sign-in panel, one level up in `TwoFaSettings`.
 *
 * ## It is `useTwoFaFlow`, unchanged
 *
 * The same machine `TwoStepVerificationDialog` drives — enter, and behind *Forgot passcode?* the four
 * recovery steps. This file is a second **view** of it, not a second flow: a passcode gate that could
 * verify but not recover would be the dead end that hook was written to remove, and the comps put
 * *Forgot passcode?* directly under the boxes here too.
 *
 * What differs from the dialog view is only what a page affords: left-aligned instead of centred, the
 * 24px title instead of 20, and the step mark in the neutral disc the comps draw rather than the
 * dialog's brand one.
 */
export function TwoFaGate({
    flow,
    /**
     * The memory aid the account wrote, shown under the boxes on the root step.
     *
     * **An addition to the comps**, and the only one on this screen. The mock has no hint value, so
     * the frames show no line for it — but a hint the account chose and can never see is a stored
     * string with no purpose, and this is the moment it is for: six empty boxes and a passcode half
     * remembered. It is the alternative to *Forgot passcode?*, which costs an email round trip.
     *
     * Root step only, and never while anything is wrong: the line under the boxes is where this
     * screen reports failures, and two sentences competing for it is how the important one is missed.
     */
    hint,
}: {
    flow: TwoFaFlow
    hint?: string | null
}) {
    const { t } = useTranslation()

    /*
     * The line under the boxes, in the order the comps show it: the flow's own failure first, then an
     * expired code — which is **not** a failed request, so it has to be stated even though nothing
     * threw, or the step goes silent with six live-looking boxes that lead nowhere.
     *
     * **14px, not 12.** Every small line on these screens is `14/Regular` in the comps — the failure
     * (`[702,14R] "Wrong code, please try again!"`), the spam note, the resend countdown — and every
     * link is `14/Medium`. This file and its three siblings had them all at `type-caption-meta` (12),
     * which is a whole step down the ramp and reads as a footnote rather than as the step's own
     * feedback. Found by auditing computed styles rather than by looking.
     */
    const message = flow.errorKey
        ? t(flow.errorKey)
        : flow.isCodeExpired
          ? t('auth_otp_expired')
          : null

    return (
        /*
         * `key` remounts on each step so the entrance replays — the values live in the hook, so
         * nothing typed is lost. Same device the two other flows on this screen use.
         */
        <div key={flow.step} className="flex w-full flex-col gap-4 md:gap-6">
            <StepHeader
                icon={{ name: MARKS[flow.step], weight: 'filled' }}
                // Neutral, which is what the comps draw — see `StepTone`'s `zinc`.
                tone="brand"
                title={t(COPY[flow.step].title)}
                description={t(COPY[flow.step].body, { email: flow.recoveryEmail })}
                // 12, per the comps — see the prop's note on `PasswordStepHeader`.
                className="gap-3"
            />

            {/* 12, which is the comps' `Container gap12` — the same step that separates the mark from
                the heading separates the boxes from the line under them (`1077:81293`). */}
            <div className={cn('flex flex-col gap-3', RISE)} style={riseDelay(2)}>
                {flow.step === 'hint' ? (
                    /*
                     * A bare input with an `aria-label`: the DS's clear affordance lives in
                     * `TextField`'s `suffix` slot and needs a *visible* label, which would print
                     * "Create hint" twice. Select-all is enough to empty an optional 50-character
                     * field, and the dialog's hint step makes the same call.
                     */
                    <input
                        data-testid="auth-two-fa-gate-hint"
                        type="text"
                        value={flow.hint}
                        onChange={event => flow.setHint(event.target.value)}
                        placeholder={t('auth_two_fa_hint_placeholder', { max: HINT_MAX_LENGTH })}
                        aria-label={t('auth_two_fa_hint_title')}
                        maxLength={HINT_MAX_LENGTH}
                        // Prose about a credential — no browser should be storing it or offering
                        // somebody else's.
                        autoComplete="off"
                        className={cn(AUTH_FIELD_CLASS, 'w-full')}
                    />
                ) : (
                    <OtpInput
                        testId={OTP_TEST_ID[flow.step]}
                        value={VALUE[flow.step](flow)}
                        onChange={ON_CHANGE[flow.step](flow)}
                        length={PASSCODE_LENGTH}
                        spread
                        invalid={Boolean(flow.errorKey) || flow.isCodeExpired}
                        /*
                         * Only when the code is dead — never while a check is in flight. Disabling a
                         * focused input drops focus to `body`, so the boxes come back live but
                         * unfocused and, on a phone, with the keyboard closed. The hook's latch is
                         * what stops a second request.
                         */
                        disabled={flow.isCodeExpired}
                        autoFocus
                    />
                )}

                {/*
                 * **No reserved row here**, unlike `TwoStepVerificationDialog` — the comps insert the
                 * failure line and let the rest shift down (`1077:82781` sits *Wrong code* above
                 * *Forgot passcode?*), and on this screen that is the right trade. The dialog reserves
                 * 20px because it is a 420px popup where a shift moves a control the reader is aiming
                 * at; this is a tall page card with the whole viewport empty below the fold, so
                 * nothing moves out from under anyone.
                 */}
                {flow.busy ? (
                    <span aria-live="polite" className="type-dense-default text-(--text-subtitle)">
                        {t('auth_otp_checking')}
                    </span>
                ) : message ? (
                    <p
                        role="alert"
                        data-testid="auth-two-fa-gate-error"
                        className="type-dense-default m-0 text-(--text-error)"
                    >
                        {message}
                    </p>
                ) : hint && flow.step === 'enter' ? (
                    <p
                        data-testid="auth-two-fa-gate-hint-note"
                        className="type-dense-default m-0 text-(--text-subtitle)"
                    >
                        {t('auth_two_fa_hint_note', { hint })}
                    </p>
                ) : null}

                <GateActions flow={flow} />
            </div>
        </div>
    )
}

/**
 * What each step offers under the message line.
 *
 * `new` and `reenter` offer nothing — they advance on the sixth digit, so a Continue button would
 * spend the step disabled and then fire something that has already happened.
 */
function GateActions({ flow }: { flow: TwoFaFlow }) {
    const { t } = useTranslation()

    if (flow.step === 'enter') {
        /*
         * *Forgot passcode?* — a text link and not a `Button`, which is what the comps draw and the
         * right weight for it: this is the way out of a dead end, not the action of the step, and a
         * filled shape would compete with the six boxes that are the point.
         */
        return (
            <button
                data-testid="auth-two-fa-gate-forgot"
                type="button"
                disabled={flow.busy}
                onClick={flow.forgot}
                className="type-dense-emphasis cursor-pointer self-start text-(--text-link) underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('auth_two_fa_forgot')}
            </button>
        )
    }

    if (flow.step === 'recovery') {
        // Counting down, the line is the *reason* resend is unavailable; at zero it becomes the
        // control. `aria-live` on the countdown, so a screen reader is told when it opens up.
        return flow.resendIn > 0 ? (
            <span aria-live="polite" className="type-dense-default text-(--text-subtitle)">
                {t('auth_otp_resend_in', { time: mmss(flow.resendIn) })}
            </span>
        ) : (
            <button
                data-testid="auth-two-fa-gate-resend"
                type="button"
                disabled={flow.busy}
                onClick={flow.resend}
                className="type-dense-emphasis cursor-pointer self-start text-(--text-link) underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('auth_otp_resend')}
            </button>
        )
    }

    if (flow.step === 'hint') {
        /*
         * **Skip is an answer, not a dismissal** — it writes `passcode_hint: ''`, which is legacy's
         * `handleSkipHint`. Both buttons finish the step and the only difference is one field, so
         * `secondary` rather than `ghost`.
         *
         * `flex-1` on both children rather than `fullWidth`, which is `w-full` and would make the
         * pair ask for 200% of the row — the mistake `TwoStepVerificationDialog`'s footer records.
         */
        return (
            <div className="flex gap-3 [&>*]:flex-1">
                <Button
                    data-testid="auth-two-fa-gate-skip"
                    variant="secondary"
                    size="large"
                    disabled={flow.busy}
                    onClick={() => flow.finish(false)}
                >
                    {t('auth_two_fa_skip')}
                </Button>
                <Button
                    data-testid="auth-two-fa-gate-save"
                    variant="accent"
                    size="large"
                    // An empty hint through this button would be indistinguishable from Skip, and
                    // the reader already has that button.
                    disabled={flow.busy || flow.hint.trim().length === 0}
                    onClick={() => flow.finish(true)}
                >
                    {t('common_continue')}
                </Button>
            </div>
        )
    }

    return null
}

/**
 * The glyph each step opens with — see `TwoFaSetupFlow`'s `MARKS` for the full account.
 *
 * The short version: every passcode step, **including the hint**, draws `Icon key` in the comps
 * (`1077:81293`, `1075:80014`), and the recovery step draws an envelope — which is why `envelope`
 * is now in `design-system/tevi-icons.extra.svg` instead of `send` standing in for it.
 *
 * ⚠ `lock-simple` where the comps draw a key: the library has no `key` and neither does upstream
 * Zappicon. One line to change when Brand ships it.
 */
const MARKS: Record<TwoFaStep, TeviIconNameFilled> = {
    enter: 'lock-simple',
    recovery: 'envelope',
    new: 'lock-simple',
    reenter: 'lock-simple',
    hint: 'lock-simple',
}

const COPY: Record<TwoFaStep, { title: string; body: string }> = {
    enter: { title: 'auth_two_fa_title', body: 'auth_two_fa_body' },
    recovery: {
        title: 'auth_two_fa_recovery_title',
        /*
         * Names the inbox when `recover/` said which, and falls back to the generic sentence when it
         * did not — an account can have more than one address, and a reader checking the wrong one
         * presses Resend at a code that already arrived.
         */
        body: 'auth_two_fa_recovery_body',
    },
    new: { title: 'auth_two_fa_new_title', body: 'auth_two_fa_new_body' },
    reenter: { title: 'auth_two_fa_reenter_title', body: 'auth_two_fa_reenter_body' },
    hint: { title: 'auth_two_fa_hint_title', body: 'auth_two_fa_hint_body' },
}

/** A distinct id per step, because `key` remounts between them — one selector meaning two fields is
 * how a driver types the confirmation into the box it thinks is the new passcode. */
const OTP_TEST_ID: Record<TwoFaStep, string> = {
    enter: 'auth-two-fa-gate',
    recovery: 'auth-two-fa-gate-code',
    new: 'auth-two-fa-gate-new',
    reenter: 'auth-two-fa-gate-confirm',
    hint: 'auth-two-fa-gate',
}

const VALUE: Record<TwoFaStep, (f: TwoFaFlow) => string> = {
    enter: f => f.passcode,
    recovery: f => f.recoveryCode,
    new: f => f.passcode,
    reenter: f => f.confirm,
    hint: () => '',
}

const ON_CHANGE: Record<TwoFaStep, (f: TwoFaFlow) => (next: string) => void> = {
    enter: f => f.setPasscode,
    recovery: f => f.setRecoveryCode,
    new: f => f.setPasscode,
    reenter: f => f.setConfirm,
    hint: () => () => undefined,
}

const mmss = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
