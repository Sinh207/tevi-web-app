'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import type { TeviIconNameFilled } from '@shared/ui/icon-names'
import { useEffect } from 'react'
import {
    HINT_MAX_LENGTH,
    PASSCODE_LENGTH,
    type TwoFaFlow,
    type TwoFaStep,
    useTwoFaFlow,
} from '../hooks/use-two-fa-flow'
import { AUTH_FIELD_CLASS } from './auth-fields'
import { OtpInput } from './otp-input'

/**
 * **Two-step verification** — prove the account passcode before an action goes ahead, and replace it
 * when it has been forgotten.
 *
 * The gate legacy puts in front of a withdrawal: `two_fa_passcode` on `/me` says the account has one,
 * `POST v1/two-fa/passcode/verify/` checks it, and only then is the request sent — with the same
 * passcode attached, because the write endpoint takes it as well. Both halves matter; see the note on
 * `onVerified`.
 *
 * ## It lives in `features/auth`, not in `features/payout`
 *
 * The passcode is a **credential**, and the feature that owns credentials owns the screen that asks for
 * one. Two consequences that are the reason rather than the tidiness argument:
 *
 * - The six boxes already exist here (`OtpInput`, three sign-in flows behind it). Building them again
 *   in `features/payout` would be a second implementation of the control this repo has already been
 *   bitten by getting wrong — paste, autofill and backspace are all in that file's comments.
 * - Withdrawal is not the last caller. The passcode gates the account, so a settings screen will
 *   manage it and other money actions will present it; a copy under `payout/` would have to move on
 *   the first of those.
 *
 * ## Five steps, and only the first is about withdrawing
 *
 * `enter` → and, behind *Forgot passcode?*, `recovery` → `new` → `reenter` → `hint`. The machine is
 * `useTwoFaFlow`; this file is the view. What that split buys is stated there: the claims worth
 * pinning are sequences, and a sequence is testable through a hook and not through a tree.
 *
 * The four recovery steps are legacy's, call for call. What is **not** ported is passcode
 * *management* — creating a first passcode, changing one you know, deleting it, reading its hint.
 * Those need a surface that can also turn the feature on, which is a settings screen this app does not
 * have; see `twoFaApi` for where that line is drawn and why.
 *
 * ## A screen, so the dismiss control is at the **leading** edge
 *
 * `p-0` plus a 56px title band — `docs/DESIGN_SYSTEM.md` §7's second case, and it is now the right one
 * because the band's start slot has two jobs: `xmark` at the root step and `angle-left` wherever there
 * is a step to go back to. That is `StarPurchaseDialog`'s arrangement exactly, and the reason it
 * cannot be a trailing close disc is that moving the close to the far edge would split one control
 * into two.
 *
 * It began as a card with a trailing `DialogCloseButton`, which was correct while `enter` was the only
 * step. Adding four gave the slot its second job.
 */
export function TwoStepVerificationDialog({
    open,
    onClose,
    onVerified,
    error,
}: {
    open: boolean
    onClose: () => void
    /**
     * The passcode, once the server has accepted it.
     *
     * **The code is handed back rather than swallowed**, because verifying is only half the gate:
     * legacy sends the same string on the withdrawal itself (`payoutRequest(passcode)` →
     * `{ …, passcode }`), so a caller that only learned *that* verification passed would send a
     * request the server can still refuse. Verification is the check the reader sees; the field on the
     * write is the one the backend enforces.
     */
    onVerified: (passcode: string) => void
    /**
     * A refusal from the action this passcode was collected for, already worded.
     *
     * The dialog re-opens when the *write* rejects the passcode — the two calls disagreeing, or a
     * passcode changed on another device between them — and without this it would re-open looking
     * identical to the first time, which reads as a dropped press rather than a refusal. Resolved text
     * and not a key, because on that path the backend's own sentence is allowed to win
     * (`docs/API_ERRORS.md`) and only the caller knows whether it had one.
     */
    error?: string | null
}) {
    const { t } = useTranslation()
    const flow = useTwoFaFlow(onVerified)

    /*
     * Cleared on open, not on close: the closing dialog is still on screen for its 200ms transition,
     * and wiping the boxes there plays a visible flush of six digits on the way out. Legacy resets on
     * `!open` and shows exactly that.
     *
     * The `error` prop is deliberately *not* reset — it belongs to the caller, which sets it as the
     * reason the dialog is re-opening.
     */
    const { restart } = flow
    useEffect(() => {
        if (open) restart()
        // `restart` and not `flow`: the identity that matters is the function's, which `useCallback([])`
        // pins. Depending on the whole object would re-run this on every keystroke and wipe the step
        // out from under the reader.
    }, [open, restart])

    /*
     * The caller's refusal shows only on the root step with nothing typed: it was about a code that has
     * since been replaced, and it has nothing to say four screens into a passcode reset. The flow's own
     * key wins wherever both exist — it is the more recent thing that happened.
     */
    const message = flow.errorKey
        ? t(flow.errorKey)
        : /*
           * **An expired code is not a failed request**, so it is stated even though nothing threw —
           * waiting out the countdown used to leave the step silent, with six live-looking boxes and
           * no hint that typing into them would go nowhere. Same omission `ForgotPasswordFlow` fixed.
           */
          flow.isCodeExpired
          ? t('auth_otp_expired')
          : flow.step === 'enter' && !flow.passcode
            ? (error ?? null)
            : null

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent
                data-testid="auth-two-fa-dialog"
                className="w-[420px] gap-0 overflow-hidden p-0"
            >
                <TwoFaDialogBody flow={flow} message={message} />
            </DialogContent>
        </Dialog>
    )
}

/**
 * The heading, the sentence and the control, per step.
 *
 * One component with a switch rather than five files: each arm is a heading, a line of body copy and
 * either `OtpInput` or the hint field, and legacy's five files are five copies of the same 250-line
 * hand-rolled OTP row. The thing that actually differs between them is three strings and which state
 * slot the boxes are bound to.
 */
function StepBody({ flow }: { flow: TwoFaFlow }) {
    const { t } = useTranslation()

    if (flow.step === 'hint') {
        return (
            <Header title={t('auth_two_fa_hint_title')} body={t('auth_two_fa_hint_body')}>
                {/*
                 * A bare input with an `aria-label`, where legacy adds a clear button inside the field.
                 * The DS clear affordance lives in `TextField`'s `suffix` slot, which requires a
                 * *visible* label — and this step already says its name in the heading above, so taking
                 * it would print "Create hint" twice. An optional 50-character field does not need a
                 * second way to empty it; select-all does.
                 */}
                <input
                    data-testid="auth-two-fa-hint"
                    type="text"
                    value={flow.hint}
                    onChange={event => flow.setHint(event.target.value)}
                    placeholder={t('auth_two_fa_hint_placeholder', { max: HINT_MAX_LENGTH })}
                    aria-label={t('auth_two_fa_hint_title')}
                    maxLength={HINT_MAX_LENGTH}
                    autoComplete="off"
                    className={cn(AUTH_FIELD_CLASS, 'w-full')}
                />
            </Header>
        )
    }

    const step = {
        enter: {
            title: 'auth_two_fa_title',
            body: 'auth_two_fa_body',
            value: flow.passcode,
            onChange: flow.setPasscode,
        },
        recovery: {
            title: 'auth_two_fa_recovery_title',
            /*
             * **Names the inbox when `recover/` said which**, and falls back to legacy's "your recovery
             * email address" when it did not. An account can have more than one address, or one it has
             * not opened in a year — the generic sentence leaves it guessing, and a reader checking the
             * wrong inbox presses Resend at a code that already arrived.
             */
            body: flow.recoveryEmail
                ? 'auth_two_fa_recovery_body_email'
                : 'auth_two_fa_recovery_body',
            value: flow.recoveryCode,
            onChange: flow.setRecoveryCode,
        },
        new: {
            title: 'auth_two_fa_new_title',
            body: 'auth_two_fa_new_body',
            value: flow.passcode,
            onChange: flow.setPasscode,
        },
        reenter: {
            title: 'auth_two_fa_reenter_title',
            body: 'auth_two_fa_reenter_body',
            value: flow.confirm,
            onChange: flow.setConfirm,
        },
    }[flow.step]

    return (
        <Header
            title={t(step.title)}
            body={t(step.body, { email: flow.recoveryEmail })}
            /*
             * **Two of the five steps carry a mark, and they are the two that change subject.**
             *
             * `enter` says what the screen is for. `recovery` says *where to go look* — legacy draws its
             * own `EmailIcon` there for exactly that reason, and the step is the one place in the flow
             * that sends the reader out of the app. The two steps after it are still about the same
             * inbox-less act of choosing a passcode, so a mark repeated four times is decoration that
             * pushes the boxes down a phone screen.
             */
            mark={MARKS[flow.step]}
        >
            <OtpInput
                testId="auth-two-fa"
                value={step.value}
                onChange={step.onChange}
                length={PASSCODE_LENGTH}
                invalid={Boolean(flow.errorKey) || flow.isCodeExpired}
                /*
                 * **Only when the code is dead — never while a check is in flight.** Disabling a
                 * focused input makes the browser drop focus to `body`, so after a rejected code the
                 * boxes would come back enabled but unfocused: nothing typed goes anywhere, and on a
                 * phone the keyboard closes. The flow's own latch already stops a second request, so
                 * there is nothing left for `disabled` to protect there. An expired code is the one
                 * case where the boxes genuinely lead nowhere until Resend is pressed. Both halves are
                 * `ForgotPasswordFlow`'s findings.
                 */
                disabled={flow.isCodeExpired}
                autoFocus
            />
            {/*
             * ⚠ **No hint line here, deliberately.** `TwoFaGate` shows one under its boxes, which is
             * the same step on the settings screen — and it can, because that screen reads
             * `GET v1/two-fa/passcode/` for other reasons. This dialog's one caller is the withdrawal
             * screen, which holds no such record, and making it fetch one would put a request in front
             * of a money action to print a sentence. A `hint` prop lived here for a few commits with
             * nothing passing it; the repo's rule against anticipatory API (stated at the event bus in
             * `CLAUDE.md`) applies to props too.
             */}
        </Header>
    )
}

/**
 * The glyph each step opens with, or nothing.
 *
 * ⚠ **`send`, a stand-in for the envelope legacy and the comps draw** (Figma `Two-step verification`
 * node `1070:94156`, a rounded open-flap envelope). Icons come only from the DS sprite — what
 * `/dev/icons` shows — and it has no envelope, `mail` or `letter`; the upstream-Zappicon overlay that
 * once carried one is gone. `send` says "a code was sent", which is half of the sentence (the step
 * is about which inbox to open). One line to change when Brand adds an envelope to the library.
 */
const MARKS: Record<TwoFaStep, TeviIconNameFilled | null> = {
    enter: 'lock-simple',
    recovery: 'send',
    new: null,
    reenter: null,
    hint: null,
}

function Header({
    title,
    body,
    mark,
    children,
}: {
    title: string
    body: string
    /**
     * The glyph in the disc, or `null` for no mark.
     *
     * `TeviIconNameFilled` and not the bare name union: the disc draws `weight="filled"`, and `Icon`
     * types its `name` per weight precisely so asking for a glyph that has no filled drawing is a type
     * error rather than an empty box.
     */
    mark?: TeviIconNameFilled | null
    children: React.ReactNode
}) {
    return (
        <>
            <div className="flex flex-col items-center gap-2 text-center">
                {mark ? (
                    /*
                     * **`lock-simple`, where legacy draws a key.** The sprite has no `key`, and
                     * neither does upstream Zappicon v1.2.0 — its `key-simple-square` is a bordered
                     * card with a keyhole, a different drawing, and the overlay's rules forbid
                     * adapting one glyph into another's shape. `lock-simple--filled` says the same
                     * thing (this is secured) and is in the committed subset. The envelope on the
                     * recovery step *was* the same kind of stand-in and is now the real glyph — see
                     * `MARKS`.
                     *
                     * ## The disc is **brand**, not `--background-segment`
                     *
                     * Measured: in Light the dialog's own ground is `--background-subtle` (`--zinc-100`)
                     * and `--background-segment` is `#edeeef` — a 1.02:1 difference, so the disc was
                     * invisible and the glyph looked like it was floating on the card. The brand pair is
                     * the one this app already uses for a mark inside a disc (the ledger rows), and
                     * `--text-on-brand` exists precisely because `--text-brand` on that ground fails in
                     * Dark: the two match in Light and diverge in Dark.
                     */
                    <span className="flex size-12 items-center justify-center rounded-full bg-(--background-brand)">
                        <Icon
                            weight="filled"
                            name={mark}
                            size={24}
                            aria-hidden
                            className="text-(--text-on-brand)"
                        />
                    </span>
                ) : null}
                <p className="type-title-t2-semibold m-0 text-(--text-title)">{title}</p>
                <p className="type-dense-default m-0 text-(--text-body)">{body}</p>
            </div>
            {children}
        </>
    )
}

/**
 * What each step offers below the message line.
 *
 * Three of the five offer nothing: `new` and `reenter` advance on the sixth digit, and there is
 * deliberately no Continue button on them — it would spend the whole step disabled and then fire
 * something that has already happened.
 */
function StepActions({ flow }: { flow: TwoFaFlow }) {
    const { t } = useTranslation()

    if (flow.step === 'enter') {
        /*
         * *Forgot passcode?* — a text button, not a `Button`. It is the way out of a dead end rather
         * than the action of the step, and giving it a filled or outlined shape would make it compete
         * with the six boxes that are the point.
         */
        return (
            <button
                data-testid="auth-two-fa-forgot"
                type="button"
                disabled={flow.busy}
                onClick={flow.forgot}
                className="type-caption-meta cursor-pointer self-center border-0 bg-transparent text-text-link underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('auth_two_fa_forgot')}
            </button>
        )
    }

    if (flow.step === 'recovery') {
        /*
         * Counting down, this line is the *reason* resend is unavailable; at zero it becomes the
         * control. `aria-live` is on the countdown so a reader is told when it opens up — the shape
         * `ForgotPasswordFlow` settled on, minus its expiry state: this code has no stated lifetime.
         */
        /*
         * `auth_otp_resend` / `auth_otp_resend_in` are **reused**, not re-keyed per flow. Legacy has
         * its own pair, and importing them would have collided with the countdown format: the legacy
         * zh-TW string bakes in 秒 ("seconds") while `mmss` produces `0:29`, so it would have read
         * "0:29 秒後". This app's existing pair is unit-free in all nine locales for exactly that
         * reason, and it is the same sentence about the same thing.
         */
        return flow.resendIn > 0 ? (
            <span aria-live="polite" className="type-caption-meta self-center text-text-subtitle">
                {t('auth_otp_resend_in', { time: mmss(flow.resendIn) })}
            </span>
        ) : (
            <button
                data-testid="auth-two-fa-resend"
                type="button"
                disabled={flow.busy}
                onClick={flow.resend}
                className="type-caption-meta cursor-pointer self-center border-0 bg-transparent text-text-link underline underline-offset-2 hover:no-underline disabled:cursor-not-allowed disabled:opacity-50"
            >
                {t('auth_otp_resend')}
            </button>
        )
    }

    if (flow.step === 'hint') {
        return (
            /*
             * `DialogFooter layout="side-by-side"` and **not** a hand-rolled flex row: it applies
             * `[&>*]:flex-1`, which is the part a row of two buttons cannot do for itself.
             *
             * The first version was `flex gap-3` with `fullWidth` on both children — and `fullWidth`
             * is `w-full`, so each button asked for the whole container and the pair came to 200% plus
             * the gap. *Continue* was pushed past the dialog's edge and clipped away by
             * `overflow-hidden`; measured in the browser, because both buttons still answered to their
             * testids and every test passed.
             */
            <DialogFooter layout="side-by-side">
                {/*
                 * **Skip is a real answer, not a dismissal** — it writes the passcode with an empty
                 * hint, which is legacy's `handleSkipHint`. So both buttons complete the flow and the
                 * only difference is one field; `secondary` rather than `ghost` for that reason, unlike
                 * `PayoutFastPremiumDialog` where the second button is the way *past* an offer.
                 */}
                <Button
                    data-testid="auth-two-fa-skip"
                    variant="secondary"
                    size="large"
                    disabled={flow.busy}
                    onClick={() => flow.finish(false)}
                >
                    {t('auth_two_fa_skip')}
                </Button>
                <Button
                    data-testid="auth-two-fa-save"
                    variant="accent"
                    size="large"
                    // An empty hint through this button would be indistinguishable from Skip; the
                    // reader has one of those already, so this one asks for what it is named after.
                    disabled={flow.busy || flow.hint.trim().length === 0}
                    onClick={() => flow.finish(true)}
                >
                    {t('common_continue')}
                </Button>
            </DialogFooter>
        )
    }

    return null
}

const mmss = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`

/**
 * Everything inside the popup: the band, the step, the message row and the step's own actions.
 *
 * Split out **so `/dev/two-fa` can render all five steps**. Four of them are otherwise unreachable in
 * development: they are behind `two_fa_passcode: true` on a real `/me`, a live `recover/` email, and a
 * six-digit code from that inbox — so nobody could look at the recovery flow without an account that
 * has two-step verification switched on. Same argument `/dev/payout` makes for its tracking rows.
 *
 * It takes a `TwoFaFlow` rather than building one, which is the whole seam: the dialog owns the
 * machine (`useTwoFaFlow`), and the harness hands over a literal. Nothing here is exported from
 * `index.ts` — see `dev.ts`.
 */
export function TwoFaDialogBody({
    flow,
    /** The line under the boxes, already resolved by the dialog — see its `message`. */
    message,
}: {
    flow: TwoFaFlow
    message: string | null
}) {
    const { t } = useTranslation()

    return (
        <>
            {/*
             * The band, and its one slot carries both jobs — `xmark` at the root step,
             * `angle-left` wherever there is a step behind. `DialogScreenHeader` owns the geometry
             * and the rule; see its note on why a copied class string is what this replaced.
             *
             * The title names the **feature**, the same on all five steps, while each step body
             * names itself. It first followed legacy, which puts *Enter passcode* in the band on
             * the root step — and measured on screen that printed "Enter passcode" twice, 120px
             * apart, because the root step also carries it as a heading. Holding the band still
             * also stops the title jumping the instant somebody presses *Forgot passcode?*.
             */}
            <DialogScreenHeader
                title={t('auth_two_fa_flow_title')}
                // The dialog's own id; the control's is derived (`-prev` / `-close`) — see the
                // note on `DialogScreenHeader.testId` for why not a ternary here.
                testId="auth-two-fa-header"
                onBack={flow.canGoBack ? flow.back : undefined}
                disabled={flow.busy}
            />

            <div className="flex flex-col gap-4 p-4 sm:p-6">
                {/*
                 * **The reset note is a tinted block, and not green text.** Measured on the Light
                 * dialog ground (`--background-subtle`, `#f4f4f5`): `--accents-success-active` is
                 * **2.32:1**, well under AA for 14px — the token does not flip between modes, so it
                 * reads at 6.93 in Dark and fails only where most people will see it. On the DS's own
                 * success tint, `--text-title` is 18.06.
                 *
                 * Same treatment as `PayoutConfirmDialog`'s ETA strip, and the same finding: at these
                 * tiers the accent inks are for *marks*, not for sentences.
                 *
                 * Above the boxes rather than below, because it is an instruction — "enter it to
                 * continue" has to precede the thing it is about.
                 */}
                {flow.justReset ? (
                    <p
                        aria-live="polite"
                        data-testid="auth-two-fa-note"
                        className="type-dense-default m-0 rounded-lg bg-(--accents-success-bg-active) px-4 py-3 text-center text-(--text-title)"
                    >
                        {t('auth_two_fa_reset_done')}
                    </p>
                ) : null}

                <StepBody flow={flow} />

                {/*
                 * One line for both states, and it always occupies the row: without the reserved
                 * height the content jumps 20px the moment a code is rejected, which is the same
                 * moment the reader is looking at it.
                 *
                 * **Centred**, like everything else in this dialog. It read left-aligned under a
                 * centred heading, a centred sentence and a centred row of six boxes — one line
                 * hanging off the leading edge, which is what the ragged look was.
                 */}
                <div className="min-h-5 text-center">
                    {flow.busy ? (
                        <span aria-live="polite" className="type-caption-meta text-text-subtitle">
                            {t('auth_otp_checking')}
                        </span>
                    ) : message ? (
                        <p
                            role="alert"
                            data-testid="auth-two-fa-error"
                            className="type-caption-meta m-0 text-text-error"
                        >
                            {message}
                        </p>
                    ) : null}
                </div>

                <StepActions flow={flow} />
            </div>
        </>
    )
}
