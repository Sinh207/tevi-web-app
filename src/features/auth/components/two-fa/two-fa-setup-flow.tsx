'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import type { TeviIconNameFilled } from '@shared/ui/icon-names'
import { Loader } from '@shared/ui/loader'
import type { FormEvent } from 'react'
import { HINT_MAX_LENGTH, PASSCODE_LENGTH } from '../../hooks/use-two-fa-flow'
import type { TwoFaSetup, TwoFaSetupStep } from '../../hooks/use-two-fa-setup'
import { AUTH_FIELD_CLASS, AuthTextField } from '../auth-fields'
import { OtpInput } from '../otp-input'
import { PasswordStepHeader as StepHeader } from '../password/password-step-header'

/**
 * Turning two-step verification **on** — the five steps the comps draw, in their order.
 *
 * *Create verification code* → *Re-enter verification code* → *Create hint* → *Connect your account
 * with email* → *Recovery email* (nodes `1070:93787`, `1075:79520`, `1075:80014`, `1075:80511`,
 * `1070:94263`). The machine is `useTwoFaSetup`; this file is the view, and it is a **pure** one —
 * the hook lives in `TwoFaSettings` so the screen's single back button can walk it.
 *
 * ## Three things the comps settle that the first version of this file got wrong
 *
 * **No progress bar.** None of the five screens has one. It was `PasswordStepProgress` here, which
 * that component's own doc would have argued against anyway once the steps stopped being three.
 *
 * **No back control inside the card.** The bar at the top of the page is the only one, on every
 * screen — see `TwoFaBackBar`.
 *
 * **The step mark is a neutral 56px disc**, not an accent one: `#f4f4f4` ground, `#a1a1a1` glyph
 * (`1075:79080`), which are `--background-subtle` and `--icon-secondary`. `StepTone`'s `zinc` was
 * added for it.
 *
 * ## The three OTP steps carry no button
 *
 * `passcode`, `reenter` and `code` advance on the **sixth digit**, so a *Continue* would spend the
 * step disabled and then fire something that has already happened — the call `PasswordSetupFlow` and
 * `TwoStepVerificationDialog` both make. It also means those steps have nowhere but the message line
 * to report themselves, which is why that line holds its height whether or not it has anything in it.
 *
 * ## The copy is the mobile app's, in this app's vocabulary
 *
 * Legacy's `two_step_verification_w2_*` strings are the spec — they exist in all nine of its locales
 * and are rendered by no legacy web page. One deliberate divergence: those strings alternate between
 * "password", "verification code" and "passcode" for the same six digits, and this app already says
 * **passcode** everywhere (the withdrawal gate, the drawer, `useTwoFaFlow`). The other is the 28px
 * title the comps use, which is **not in the DS type scale** (it jumps 24 → 32); `type-title-t1-bold`
 * is the nearest style and `CLAUDE.md` forbids setting a size by hand.
 */
export function TwoFaSetupFlow({ setup }: { setup: TwoFaSetup }) {
    const { t } = useTranslation()

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (setup.step === 'email') setup.sendCode(true)
        // Every other step submits on its sixth digit or with its own button; Enter has nothing to
        // repeat, and firing the previous step's call from here is how a flow double-sends.
    }

    return (
        /*
         * `key={setup.step}` remounts the subtree, which is what replays the entrance animation on
         * each step — React would otherwise reuse the elements and it would run once, on mount. The
         * field *values* live in the hook, so nothing typed is lost.
         */
        <form
            data-testid="auth-two-fa-setup-form"
            key={setup.step}
            onSubmit={submit}
            className="flex w-full flex-col gap-4 md:gap-6"
        >
            <StepHeader
                icon={{ name: MARKS[setup.step], weight: 'filled' }}
                tone="brand"
                title={t(COPY[setup.step].title)}
                description={t(COPY[setup.step].body, { email: setup.email.trim() })}
                // The address is printed on the step that *confirms* it and nowhere else: above the
                // input it is being typed into it would be an echo, and on the passcode steps it is a
                // fact the reader has not been asked for yet.
                email={setup.step === 'code' ? setup.email.trim() : undefined}
                // 12, per the comps — see `TwoFaGate`.
                className="gap-3"
            />

            {/* 12 between a control and the line under it, which is the comps' `Container gap12`. */}
            <div className={cn('flex flex-col gap-3', RISE)} style={riseDelay(2)}>
                {setup.step === 'passcode' && (
                    <OtpInput
                        testId="auth-two-fa-setup"
                        value={setup.passcode}
                        onChange={setup.setPasscode}
                        length={PASSCODE_LENGTH}
                        spread
                        invalid={Boolean(setup.errorKey)}
                        autoFocus
                    />
                )}

                {setup.step === 'reenter' && (
                    <OtpInput
                        testId="auth-two-fa-reenter"
                        value={setup.confirm}
                        onChange={setup.setConfirm}
                        length={PASSCODE_LENGTH}
                        spread
                        invalid={Boolean(setup.errorKey)}
                        autoFocus
                    />
                )}

                {setup.step === 'hint' && (
                    /*
                     * A bare input with an `aria-label`, for `TwoStepVerificationDialog`'s reason: the
                     * DS's clear affordance lives in `TextField`'s `suffix` slot and needs a *visible*
                     * label, which would print "Create hint" twice. Select-all is enough to empty an
                     * optional 50-character field.
                     *
                     * **No `autoFocus`**: it is a raw element, where the attribute is a lint error the
                     * repo does not suppress — and the step is skippable, so pulling a phone keyboard
                     * up over the two buttons that end it is the wrong default anyway.
                     */
                    <input
                        data-testid="auth-two-fa-setup-hint"
                        type="text"
                        value={setup.hint}
                        onChange={event => setup.setHint(event.target.value)}
                        placeholder={t('auth_two_fa_hint_placeholder', { max: HINT_MAX_LENGTH })}
                        aria-label={t('auth_two_fa_hint_title')}
                        maxLength={HINT_MAX_LENGTH}
                        // Prose about a credential — no browser should be storing it or offering
                        // somebody else's.
                        autoComplete="off"
                        className={cn(AUTH_FIELD_CLASS, 'w-full')}
                    />
                )}

                {setup.step === 'email' && (
                    <AuthTextField
                        data-testid="auth-two-fa-setup-email"
                        label={t('auth_email')}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoFocus
                        value={setup.email}
                        onChange={event => setup.setEmail(event.target.value)}
                        placeholder={t('auth_email_placeholder')}
                        hint={t('auth_two_fa_email_hint')}
                        // Format only, and only once something has been typed — a field cannot be
                        // wrong before it has been filled in.
                        error={
                            setup.email.trim() && !setup.isEmailValid
                                ? t('auth_email_invalid')
                                : undefined
                        }
                    />
                )}

                {setup.step === 'code' && (
                    <div className="flex flex-col gap-2">
                        <OtpInput
                            testId="auth-two-fa-code"
                            value={setup.otp}
                            onChange={setup.setOtp}
                            length={PASSCODE_LENGTH}
                            spread
                            invalid={Boolean(setup.errorKey) || setup.isCodeExpired}
                            /*
                             * Only when the code is dead — **never** while the write is in flight.
                             * Disabling a focused input makes the browser drop focus to `body`, so the
                             * boxes come back enabled but unfocused: nothing typed goes anywhere and on
                             * a phone the keyboard closes. The hook's latch already stops a second
                             * request.
                             */
                            disabled={setup.isCodeExpired}
                            autoFocus
                        />
                        {/* The comps' own line, and it earns its place: the address is right and the
                            code is sent, and the next thing the reader does is decide the mail never
                            arrived. */}
                        <p className="type-dense-default text-(--text-subtitle)">
                            {t('auth_two_fa_spam_note')}
                        </p>
                        {/* One row, three states — there is no button on this step, so this is the
                            only place it can report itself. */}
                        {setup.busy ? (
                            <span
                                aria-live="polite"
                                className="type-dense-default text-(--text-subtitle)"
                            >
                                {t('auth_otp_checking')}
                            </span>
                        ) : setup.resendIn > 0 ? (
                            <span
                                aria-live="polite"
                                className="type-dense-default text-(--text-subtitle)"
                            >
                                {t('auth_otp_resend_in', { time: mmss(setup.resendIn) })}
                            </span>
                        ) : (
                            <button
                                data-testid="auth-two-fa-setup-resend"
                                type="button"
                                onClick={setup.resend}
                                className="type-dense-emphasis cursor-pointer self-start text-(--text-link) underline underline-offset-2 hover:no-underline"
                            >
                                {t('auth_otp_resend')}
                            </button>
                        )}
                    </div>
                )}

                {/*
                 * An expired code is not a failed request, so it is stated even though nothing threw —
                 * waiting the timer out would otherwise leave the step silent, with six live-looking
                 * boxes that lead nowhere. A real error wins: it is the more specific thing that just
                 * happened.
                 */}
                {(setup.errorKey || setup.isCodeExpired) && (
                    <p
                        role="alert"
                        data-testid="auth-two-fa-setup-error"
                        className={cn(
                            'type-dense-default m-0 w-full rounded-lg px-4 py-3',
                            'bg-(--accents-error-bg-active) text-(--text-error)',
                            RISE,
                        )}
                    >
                        {t(setup.errorKey ?? 'auth_otp_expired')}
                    </p>
                )}

                {setup.step === 'hint' && (
                    /*
                     * **Skip is an answer, not a dismissal** — it writes `passcode_hint: ''`, which is
                     * legacy's `handleSkipHint`. Both buttons leave the step and the only difference is
                     * one field, so `secondary` rather than `ghost`.
                     *
                     * `flex-1` on both children rather than `fullWidth`, which is `w-full` and would
                     * make the pair ask for 200% of the row — the mistake
                     * `TwoStepVerificationDialog`'s footer records, where *Continue* was clipped off
                     * the dialog's edge with every test still passing.
                     */
                    <div className="flex gap-3 [&>*]:flex-1">
                        <Button
                            data-testid="auth-two-fa-setup-skip"
                            type="button"
                            variant="secondary"
                            size="large"
                            onClick={() => setup.submitHint(false)}
                        >
                            {t('auth_two_fa_skip')}
                        </Button>
                        <Button
                            data-testid="auth-two-fa-setup-continue"
                            type="button"
                            variant="accent"
                            size="large"
                            // An empty hint through this button would be indistinguishable from Skip,
                            // and the reader already has that button.
                            disabled={setup.hint.trim().length === 0}
                            onClick={() => setup.submitHint(true)}
                        >
                            {t('common_continue')}
                        </Button>
                    </div>
                )}

                {setup.step === 'email' && (
                    <Button
                        data-testid="auth-two-fa-setup-send"
                        type="submit"
                        variant="accent"
                        size="large"
                        fullWidth
                        disabled={setup.busy || !setup.isEmailValid}
                        aria-busy={setup.busy || undefined}
                        // The DS draws no pressed state for Button; one step smaller than the usual
                        // 3% because a full-width button travelling that far is a visible lurch.
                        className="active:not-disabled:scale-[0.99]"
                    >
                        {/* *Continue*, which is what the comp's button says — not "Send code". The
                            step's own copy already says a code is coming. */}
                        {t('common_continue')}
                        {/* The label does not change while working: swapping it moves the text,
                            changes the button's width mid-press and loses the one word that says what
                            is about to happen. `bg-current` on the dots because the DS's own dot
                            colour is a translucent near-black — correct on a page, invisible on a
                            filled button. */}
                        {setup.busy ? <Loader className="size-5 [&>span]:bg-current" /> : null}
                    </Button>
                )}
            </div>
        </form>
    )
}

/**
 * The glyph each step opens with — read off the comps' own mark frames, not chosen.
 *
 * The three passcode steps and **the hint step** all draw `Icon key` (nodes `1075:79080`,
 * `1075:80014`); both email steps draw an envelope (`1070:94156`, `1070:94329`). The hint step was
 * `pen-line` here until the frames were actually inspected — "write a hint" reads like a pen, and the
 * design says the subject is still the passcode.
 *
 * `1075:79081` is a classic key — a round bow with a hole and a toothed shaft — and since the
 * 2026-10-08 library import that is the DS's own `key` (Figma names it `key-message`; see `RENAME` in
 * `scripts/import-figma-icons.mjs`). It was `lock-simple` until then. Because this table hands the
 * name to `<Icon weight="filled">` at runtime, `key--filled` is in `build-icon-sprite.mjs`'s KEEP list
 * — the bare `key` is the outline, and the scan alone would ship only that.
 *
 * `envelope` replaced `send`, which said the wrong half of the sentence: the step is about which
 * inbox to open, not about the sending.
 *
 * `TeviIconNameFilled` and not the bare name union, deliberately: the disc draws `weight="filled"`,
 * and `Icon` types its `name` per weight precisely so that asking for a glyph with no filled drawing
 * is a **type error** rather than an empty circle. `memo-pen` was the first choice for the hint step
 * and is outline-only, which is how that was caught.
 */
const MARKS: Record<TwoFaSetupStep, TeviIconNameFilled> = {
    passcode: 'key',
    // The same subject as the step before it — a passcode being decided.
    reenter: 'key',
    // Still the passcode, per the comp. Not a pen.
    hint: 'key',
    email: 'envelope',
    code: 'envelope',
    done: 'check-circle',
}

const COPY: Record<TwoFaSetupStep, { title: string; body: string }> = {
    passcode: { title: 'auth_two_fa_create_title', body: 'auth_two_fa_create_body' },
    reenter: {
        title: 'auth_two_fa_create_reenter_title',
        body: 'auth_two_fa_create_reenter_body',
    },
    hint: { title: 'auth_two_fa_hint_title', body: 'auth_two_fa_hint_body' },
    email: { title: 'auth_two_fa_email_title', body: 'auth_two_fa_email_body' },
    code: { title: 'auth_two_fa_confirm_email_title', body: 'auth_two_fa_confirm_email_body' },
    // Never rendered by this file — `TwoFaSettings` owns the success screen, which is centred and
    // carries the illustration rather than a step header. Present so the record stays exhaustive.
    done: { title: 'auth_two_fa_enabled_title', body: 'auth_two_fa_enabled_body' },
}

/**
 * `mm:ss`, and the minutes are **padded** — the comps print `Resend code in 00:59` (`1070:94263`).
 * `PasswordSetupFlow` and the passcode dialog print `0:59`; those are their own screens' copy and are
 * left alone.
 */
const mmss = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
