'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import type { FormEvent } from 'react'
import { PASSCODE_LENGTH } from '../../hooks/use-two-fa-flow'
import type { TwoFaRecoveryEmail } from '../../hooks/use-two-fa-recovery-email'
import { AuthTextField } from '../auth-fields'
import { OtpInput } from '../otp-input'
import { PasswordStepHeader as StepHeader } from '../password/password-step-header'

/**
 * *Update recovery email* — the comps' third management action (Figma `1083:144846`).
 *
 * One screen, one field, and the same frame the other flow steps sit in: 516 column, an envelope mark
 * at 56, `gap 12` to the heading, `gap 24` to the field, and *Continue* below.
 *
 * **The tick in the field is the comp's** (`Outlined/32/Check`, 16×16 at the trailing edge) and it is
 * the whole affordance for "this is a valid address" — paired with the hint line under it,
 * *You're all set to continue.* Both appear only once the address parses, which is what makes them
 * information rather than decoration.
 *
 * **Two steps, because the new address is proved.** *Continue* mails a code to it and the second
 * screen collects it — "Your recovery email … needs to be confirmed and is not yet active", which is
 * what the app itself shows. The first cut of this file had only the address step and committed on
 * the passcode alone; that was wrong twice over (see `useTwoFaRecoveryEmail`), and an unverified
 * change would have pointed account recovery at an inbox the account may not own.
 *
 * A **pure view**: `useTwoFaRecoveryEmail` lives in `TwoFaSettings` so the screen's one back button
 * can reach it and so the gate can be re-raised from the same place that knows the write was refused.
 */
export function TwoFaRecoveryEmailFlow({ flow }: { flow: TwoFaRecoveryEmail }) {
    const { t } = useTranslation()

    const submit = (event: FormEvent) => {
        event.preventDefault()
        // The address step is the only one with a button; the code step submits on its sixth digit.
        if (flow.step === 'email') flow.sendCode(true)
    }

    /* The backend's own sentence wins over ours — `docs/API_ERRORS.md`, and on this screen it is the
       only diagnosis a reader (or we) get while the contract is still being confirmed. */
    const message = flow.errorText ?? (flow.errorKey ? t(flow.errorKey) : null)
    const onCode = flow.step === 'code'

    return (
        /* `key` remounts on each step so the entrance replays; the values live in the hook. */
        <form key={flow.step} onSubmit={submit} className="flex w-full flex-col gap-6">
            <StepHeader
                icon={{ name: 'envelope', weight: 'filled' }}
                tone="brand"
                title={t(
                    onCode ? 'auth_two_fa_confirm_email_title' : 'auth_two_fa_recovery_email_title',
                )}
                description={t(
                    onCode ? 'auth_two_fa_confirm_email_body' : 'auth_two_fa_recovery_email_body',
                    { email: flow.email.trim() },
                )}
                // The address is repeated on the step that confirms it — it is the one fact a wrong
                // answer here hinges on, and the step that could fix it is one back.
                email={onCode ? flow.email.trim() : undefined}
                // 12, per the comps — see `TwoFaGate`.
                className="gap-3"
            />

            <div className={cn('flex flex-col gap-3', RISE)} style={riseDelay(2)}>
                {onCode ? (
                    <>
                        <OtpInput
                            testId="auth-two-fa-recovery-code"
                            value={flow.otp}
                            onChange={flow.setOtp}
                            length={PASSCODE_LENGTH}
                            spread
                            invalid={Boolean(message) || flow.isCodeExpired}
                            /*
                             * Only when the code is dead — never while the write is in flight, which
                             * would drop focus to `body` and close the phone keyboard.
                             */
                            disabled={flow.isCodeExpired}
                            autoFocus
                        />
                        {/* The app's own line, and it earns its place: the address is right and the
                            mail is sent, and the next thing the reader does is decide it never came. */}
                        <p className="type-dense-default text-(--text-subtitle)">
                            {t('auth_two_fa_spam_note')}
                        </p>
                        {flow.busy ? (
                            <span
                                aria-live="polite"
                                className="type-dense-default text-(--text-subtitle)"
                            >
                                {t('auth_otp_checking')}
                            </span>
                        ) : flow.resendIn > 0 ? (
                            <span
                                aria-live="polite"
                                className="type-dense-default text-(--text-subtitle)"
                            >
                                {t('auth_otp_resend_in', { time: mmss(flow.resendIn) })}
                            </span>
                        ) : (
                            <button
                                data-testid="auth-two-fa-recovery-resend"
                                type="button"
                                onClick={flow.resend}
                                className="type-dense-emphasis cursor-pointer self-start text-(--text-link) underline underline-offset-2 hover:no-underline"
                            >
                                {t('auth_otp_resend')}
                            </button>
                        )}
                    </>
                ) : (
                    <AuthTextField
                        data-testid="auth-two-fa-recovery-email"
                        label={t('auth_email')}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoFocus
                        value={flow.email}
                        onChange={event => flow.setEmail(event.target.value)}
                        placeholder={t('auth_email_placeholder')}
                        /*
                         * The comp's tick and its sentence, both gated on the address parsing. Before that
                         * there is nothing to affirm, and a tick shown early would be affirming a typo.
                         */
                        suffix={
                            flow.isEmailValid ? (
                                <Icon
                                    name="check"
                                    size={16}
                                    aria-hidden
                                    className="text-(--accents-success-active)"
                                />
                            ) : undefined
                        }
                        hint={flow.isEmailValid ? t('auth_two_fa_recovery_email_valid') : undefined}
                        // Format only, and only once something has been typed — a field cannot be wrong
                        // before it has been filled in.
                        error={
                            flow.email.trim() && !flow.isEmailValid
                                ? t('auth_email_invalid')
                                : undefined
                        }
                    />
                )}

                {/*
                 * An expired code is not a failed request, so it is stated even though nothing threw.
                 * Inserted rather than reserved, per the comps — `TwoFaGate` carries the reasoning.
                 */}
                {message || flow.isCodeExpired ? (
                    <p
                        role="alert"
                        data-testid="auth-two-fa-recovery-email-error"
                        className={cn(
                            'type-dense-default m-0 w-full rounded-lg px-4 py-3',
                            'bg-(--accents-error-bg-active) text-(--text-error)',
                            RISE,
                        )}
                    >
                        {message ?? t('auth_otp_expired')}
                    </p>
                ) : null}

                {/* No button on the code step: the sixth digit submits, so one would spend the step
                    disabled and then fire something already done. */}
                {onCode ? null : (
                    <Button
                        data-testid="auth-two-fa-recovery-email-submit"
                        type="submit"
                        variant="accent"
                        size="large"
                        fullWidth
                        disabled={flow.busy || !flow.isEmailValid}
                        aria-busy={flow.busy || undefined}
                        // The DS draws no pressed state for Button; one step smaller than the usual 3%
                        // because a full-width button travelling that far is a visible lurch.
                        className="active:not-disabled:scale-[0.99]"
                    >
                        {t('common_continue')}
                        {/* The label does not change while working: swapping it moves the text, changes
                        the button's width mid-press and loses the one word that says what is about to
                        happen. */}
                        {flow.busy ? <Loader className="size-5 [&>span]:bg-current" /> : null}
                    </Button>
                )}
            </div>
        </form>
    )
}

const mmss = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
