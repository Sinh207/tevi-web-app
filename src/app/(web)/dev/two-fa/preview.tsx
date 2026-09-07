'use client'

import { TwoFaDialogBody } from '@features/auth/dev'
import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog } from '@shared/ui/dialog'
import { flowAt } from './fixtures'

/**
 * The eight states worth a look: the five steps, plus the three the flow only reaches after something
 * goes wrong or comes right.
 *
 * The error/expired/reset rows are the point of the page as much as the steps are — each is a line of
 * copy and a colour that nothing else in the repo covers, and two of them were measured and changed
 * during the port (the reset note's contrast, the expired code's disabled boxes).
 */
/**
 * ⚠ **Keys, not sentences.** The three failure states first held hardcoded English copied out of
 * `en/translation.json` — and a harness whose purpose is reviewing copy, showing copy that has since
 * been reworded, is worse than no harness. Resolved through `t()` below, so the preview cannot drift
 * from the screen and reads in whatever locale the cookie says.
 */
const STATES = [
    {
        label: 'enter',
        hint: 'the only step a withdrawal sees',
        flow: flowAt('enter'),
        messageKey: null,
    },
    {
        label: 'enter · refused',
        hint: 'the write rejected the passcode, so the dialog re-opened',
        flow: flowAt('enter'),
        messageKey: 'payout_request_passcode_required',
    },
    {
        label: 'enter · just reset',
        hint: 'back at the start after the recovery chain finished',
        flow: flowAt('enter', { justReset: true }),
        messageKey: null,
    },
    {
        label: 'recovery',
        hint: 'code mailed, countdown running, no resend yet',
        flow: flowAt('recovery'),
        messageKey: null,
    },
    {
        label: 'recovery · expired',
        hint: 'the countdown is the code’s lifetime — boxes disabled, resend offered',
        flow: flowAt('recovery', { resendIn: 0, isCodeExpired: true }),
        messageKey: 'auth_otp_expired',
    },
    {
        label: 'new',
        hint: 'choosing a passcode; no request is made',
        flow: flowAt('new'),
        messageKey: null,
    },
    {
        label: 'reenter · mismatch',
        hint: 'local comparison, so it costs no request and does not spend the OTP',
        flow: flowAt('reenter'),
        messageKey: 'auth_two_fa_mismatch',
    },
    {
        label: 'hint',
        hint: 'Skip and Continue both finish',
        flow: flowAt('hint'),
        messageKey: null,
    },
] as const

/**
 * All eight states at once, each in a panel — and each wrapped in a bare `Dialog` **root**.
 *
 * Two dead ends got to this shape, both measured:
 *
 * 1. **A plain card threw.** `DialogScreenHeader` uses `DialogTitle` and `DialogClose`, which read
 *    base-ui's dialog context — *"Cannot destructure property 'store' of useDialogRootContext(...)"*.
 *    That context is not incidental: `DialogTitle` is what labels the popup for assistive tech.
 * 2. **`DialogContent` cannot be used eight times.** It portals and renders `DialogOverlay`
 *    (`fixed inset-0 z-50`), so eight of them stack and only the last is reachable — the overlay ate
 *    every click, `modal={false}` included, since the overlay is inside the content rather than
 *    conditional on the mode.
 *
 * So: `Dialog` supplies the context, and the panel supplies `DialogContent`'s *surface* — same width,
 * radius, border and ground — without its portal. What the page therefore cannot show is the overlay,
 * the scroll lock and the focus trap; those need the real dialog on the real screen.
 */
export function TwoFaPreview() {
    const { t } = useTranslation()

    return (
        <main className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-4 py-8">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold m-0 text-(--text-title)">
                    Two-Step Verification
                </h1>
                <p className="type-dense-default m-0 text-(--text-body)">
                    Five steps and three failure states. Four of the five cannot be reached without
                    an account that has a passcode set and a live recovery email, which is why this
                    page exists. Every control is inert here — the real transitions are network
                    answers.
                </p>
            </header>

            <div className="grid gap-8 md:grid-cols-2">
                {STATES.map(state => (
                    <section key={state.label} className="flex flex-col gap-2">
                        <h2 className="type-micro-overline m-0 text-(--text-body)">
                            {state.label}
                        </h2>
                        <p className="type-caption-meta m-0 text-(--text-subtitle)">{state.hint}</p>
                        <Dialog open modal={false}>
                            <div className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-separator-default bg-background-subtle shadow-2xl">
                                <TwoFaDialogBody
                                    flow={state.flow}
                                    message={state.messageKey ? t(state.messageKey) : null}
                                />
                            </div>
                        </Dialog>
                    </section>
                ))}
            </div>
        </main>
    )
}
