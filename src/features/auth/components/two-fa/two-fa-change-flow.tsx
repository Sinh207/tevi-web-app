'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import type { TeviIconNameFilled } from '@shared/ui/icon-names'
import type { TwoFaChange, TwoFaChangeStep } from '../../hooks/use-two-fa-change'
import { HINT_MAX_LENGTH, PASSCODE_LENGTH } from '../../hooks/use-two-fa-flow'
import { AUTH_FIELD_CLASS } from '../auth-fields'
import { OtpInput } from '../otp-input'
import { PasswordStepHeader as StepHeader } from '../password/password-step-header'

/**
 * Replacing a passcode the account knows — the three screens the comps draw behind the *Change* row
 * (`1081:93328`, `1082:138166`, `1082:138780`): new passcode, re-enter, create hint.
 *
 * A **pure view**: `useTwoFaChange` lives in `TwoFaSettings`, one level up, and the flow object comes
 * down as a prop. That is not tidiness — it is what lets the passcode gate be rendered from the same
 * place that knows the write was refused. With the hook in here, "the write says the current passcode
 * is wrong, so raise the gate again" would have to travel upwards through a callback fired from an
 * effect; from up there it is a boolean the parent already holds and can simply render on.
 *
 * **No progress bar and no back control of its own.** Neither appears on any of the eleven comps —
 * the screen's one back affordance is the bar at the top of the page, which `TwoFaSettings` hands a
 * step-aware `onBack`. A bar over three steps would also be the decoration `PasswordStepProgress`'s
 * own doc warns about.
 *
 * There is no *Continue* on the two code steps either: the sixth digit advances, and on the hint step
 * the two buttons are the write.
 */
export function TwoFaChangeFlow({ change }: { change: TwoFaChange }) {
    const { t } = useTranslation()

    return (
        /*
         * `key` remounts on each step so the entrance animation replays — the values live in the hook,
         * so nothing typed is lost. Same device the setup flow and `PasswordSetupFlow` use.
         */
        <div key={change.step} className="flex w-full flex-col gap-4 md:gap-6">
            <StepHeader
                icon={{ name: MARKS[change.step], weight: 'filled' }}
                // Neutral, which is what the comps draw — see `StepTone`'s `zinc`.
                tone="brand"
                title={t(COPY[change.step].title)}
                description={t(COPY[change.step].body)}
                // 12, per the comps — see `TwoFaGate`.
                className="gap-3"
            />

            <div className={cn('flex flex-col gap-3', RISE)} style={riseDelay(2)}>
                {change.step === 'hint' ? (
                    /* A bare input with an `aria-label`, for `TwoFaGate`'s reason: the DS's clear
                       affordance needs a *visible* label, which would print "Create hint" twice. */
                    <input
                        data-testid="auth-two-fa-change-hint"
                        type="text"
                        value={change.hint}
                        onChange={event => change.setHint(event.target.value)}
                        placeholder={t('auth_two_fa_hint_placeholder', { max: HINT_MAX_LENGTH })}
                        aria-label={t('auth_two_fa_hint_title')}
                        maxLength={HINT_MAX_LENGTH}
                        autoComplete="off"
                        className={cn(AUTH_FIELD_CLASS, 'w-full')}
                    />
                ) : (
                    <OtpInput
                        /*
                         * A different id per step, and the `key` above remounts between them. Both
                         * matter to a driver: one selector that means two different fields is how a
                         * test types the confirmation into the box it thinks is the new passcode.
                         */
                        testId={
                            change.step === 'reenter'
                                ? 'auth-two-fa-change-confirm'
                                : 'auth-two-fa-change-new'
                        }
                        value={change.step === 'reenter' ? change.confirm : change.passcode}
                        onChange={
                            change.step === 'reenter' ? change.setConfirm : change.setPasscode
                        }
                        length={PASSCODE_LENGTH}
                        spread
                        invalid={Boolean(change.errorKey)}
                        /*
                         * Never disabled while the write is in flight — a focused input that is
                         * disabled drops focus to `body`, and the boxes come back live but unfocused
                         * with the phone keyboard closed. The hook's latch stops a second request.
                         */
                        autoFocus
                    />
                )}

                {/* Inserted rather than reserved, per the comps — `TwoFaGate` carries the reasoning
                    and why the dialog does the opposite. */}
                {change.busy ? (
                    <span aria-live="polite" className="type-dense-default text-(--text-subtitle)">
                        {t('auth_otp_checking')}
                    </span>
                ) : change.errorKey ? (
                    <p
                        role="alert"
                        data-testid="auth-two-fa-change-error"
                        className="type-dense-default m-0 text-(--text-error)"
                    >
                        {t(change.errorKey)}
                    </p>
                ) : null}

                {change.step === 'hint' && (
                    /*
                     * **Skip is an answer, not a dismissal** — it writes `passcode_hint: ''`, which is
                     * legacy's `handleSkipHint`. Both buttons complete the change and the only
                     * difference is one field, so `secondary` rather than `ghost`.
                     *
                     * `flex-1` on both children rather than `fullWidth`, which is `w-full` and would
                     * make the pair ask for 200% of the row — the mistake
                     * `TwoStepVerificationDialog`'s footer records, where *Continue* was clipped off
                     * the dialog's edge with every test still passing.
                     */
                    <div className="flex gap-3 [&>*]:flex-1">
                        <Button
                            data-testid="auth-two-fa-change-skip"
                            variant="secondary"
                            size="large"
                            disabled={change.busy}
                            onClick={() => change.finish(false)}
                        >
                            {t('auth_two_fa_skip')}
                        </Button>
                        <Button
                            data-testid="auth-two-fa-change-save"
                            variant="accent"
                            size="large"
                            // An empty hint through this button would be indistinguishable from Skip,
                            // and the reader already has that button.
                            disabled={change.busy || change.hint.trim().length === 0}
                            onClick={() => change.finish(true)}
                        >
                            {t('common_continue')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}

/**
 * All three steps draw the same mark, because the comps do: `Icon key` on the two code steps and on
 * *Create hint* as well (`1082:138780`) — the subject is the passcode throughout.
 *
 * ⚠ `lock-simple` where that key should be; the library has no `key` and neither does upstream
 * Zappicon. `TwoFaSetupFlow`'s `MARKS` carries the reasoning and the one line to change.
 */
const MARKS: Record<TwoFaChangeStep, TeviIconNameFilled> = {
    new: 'lock-simple',
    reenter: 'lock-simple',
    hint: 'lock-simple',
}

const COPY: Record<TwoFaChangeStep, { title: string; body: string }> = {
    new: { title: 'auth_two_fa_new_title', body: 'auth_two_fa_new_body' },
    reenter: { title: 'auth_two_fa_reenter_title', body: 'auth_two_fa_reenter_body' },
    hint: { title: 'auth_two_fa_hint_title', body: 'auth_two_fa_hint_body' },
}
