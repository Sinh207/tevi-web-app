'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { qrImageUrl } from '@shared/lib/qr-image'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import { useState } from 'react'
import { useQrSignIn } from '../hooks/use-qr-sign-in'
import { QR_SIGN_IN_STEPS } from '../lib/illustrations'
import { useAuth } from '../providers/auth-provider'
import { AuthErrorMessage } from './auth-error-message'
import { AuthStepHeader } from './auth-step-header'
import { Spinner } from './provider-button'

/** The code's drawn box, and what the API is asked to render — one number, so they cannot drift. */
const QR_SIZE = 200

/**
 * The QR step: a code the native app scans to hand this browser a session.
 *
 * ## The panel is the whole step, header included
 *
 * Like `ForgotPasswordFlow` and unlike the email step, this draws its own `AuthStepHeader`. It has
 * a state its callers cannot see — the code can fail to mint, and the way back from that is a
 * retry, not a different heading — so a caller that owned the header would have to know about it.
 *
 * ## Reserved before it arrives
 *
 * The plate is `QR_SIZE` square in every state, so the spinner, the code and the failure all sit
 * in the same box. Growing the card by 200px the moment the socket is ready would move the "back"
 * control under the pointer of anyone reaching for it, in a dialog that opened over what they were
 * already doing.
 *
 * ## The screenshots are load-bearing
 *
 * A QR code is useless to somebody who cannot find the scanner, and "choose Scan QR code" does not
 * say *where*. Legacy pairs the code with two screenshots of the app for exactly that reason, and
 * they are ported — committed rather than fetched, like all static art here
 * (`lib/illustrations.ts`, `docs/STATIC_ASSETS.md`). They are the one illustration in this repo
 * whose absence would not merely leave a screen plainer: it would leave this one unusable.
 */
export function QrSignInPanel({ onBack }: { onBack: () => void }) {
    const { t } = useTranslation()
    const { isSigningIn, loginMethod, signInErrorKey } = useAuth()
    const { status, qrText, retry } = useQrSignIn()

    /**
     * The code the *browser* could not draw, as opposed to the ones the API could not mint.
     *
     * `/qr/v1/` is a remote image on a path a content blocker is happy to match, and it is reached
     * over a network that has just been asked for two other things. When it does not arrive,
     * `next/image` renders the broken-image glyph — under a sentence telling the reader to scan it.
     * That is the one failure the panel could not previously see.
     *
     * Held as *which text* failed rather than as a boolean, so a retry clears it by producing a
     * different one. A flag would need an effect to reset, and an effect that resets a flag is how
     * a retry comes to render a broken code it has already replaced.
     */
    const [brokenText, setBrokenText] = useState<string | null>(null)

    /**
     * The session was delivered and refused — the tenth account, a `/me` that would not load.
     * Scoped to `loginMethod`, because `signInErrorKey` is one slot shared with the email form and
     * the provider rows; an error left there by an earlier attempt is not this panel's to report.
     */
    const rejected = loginMethod === 'qr' && signInErrorKey !== null

    /**
     * What the plate is holding. One value rather than a chain of ternaries in the markup: three
     * of these arrive from three different places (the hook, the store, the `<img>`) and reading
     * the precedence off nested JSX is how one of them ends up unreachable.
     *
     * `busy` outranks everything: once the phone has approved, a retry button would offer to throw
     * away a sign-in that is already succeeding.
     */
    const view: 'busy' | 'retry' | 'code' = isSigningIn
        ? 'busy'
        : status === 'error' || (qrText !== null && qrText === brokenText)
          ? 'retry'
          : status === 'ready' && qrText !== null
            ? 'code'
            : 'busy'

    const code = view === 'code' ? qrText : null

    /**
     * The line under the plate — and it is `null` exactly once, when the session was refused:
     * `AuthErrorMessage` is about to print the real reason, and the generic "we couldn't create a
     * code" is not it. Everything else always says something, so the reader is never left with a
     * spinner and no words.
     */
    const caption = isSigningIn
        ? t('auth_signing_in')
        : rejected
          ? null
          : view === 'retry'
            ? // Deliberately "show" and not "create": this branch is reached both when the API
              // would not mint a code and when the browser could not draw the one it minted, and
              // a sentence that names only the first is a lie half the time it is read.
              t('auth_qr_failed')
            : // Not the scan instructions yet — there is nothing to scan. Telling somebody to
              // point their phone at a spinner is the kind of copy that is only ever read once.
              view === 'busy'
              ? t('common_loading')
              : t('auth_qr_hint')

    return (
        <div className="flex w-full flex-col gap-4">
            <AuthStepHeader title={t('auth_qr_title')} onBack={onBack} />

            <div className="flex flex-col items-center gap-3">
                {/*
                 * White in both themes **while it holds the code**, on purpose. A camera finds a
                 * code by the contrast between dark modules and a light quiet zone; inverting it
                 * for dark mode makes it unreadable on many scanners. Same call as
                 * `ChannelEventQrDialog` and `GetAppDialog` — one of the few places a literal
                 * white is right.
                 *
                 * Empty, it is `background-subtle` instead. A white square holding a spinner is
                 * the one case where the rule inverts: the spinner is `currentColor`, and on a
                 * fixed white plate in dark mode `currentColor` is near-white, so the plate would
                 * simply look blank while it loads. The zinc ramp cannot rescue it either — it
                 * inverts with the mode (CLAUDE.md), which is the same problem written differently.
                 *
                 * The border is what stops the plate from floating in light mode, where the card
                 * behind it is nearly the same colour.
                 */}
                <div
                    className={cn(
                        'flex items-center justify-center rounded-2xl border border-separator-default p-3',
                        // The plate lights up as the code lands rather than snapping, which is the
                        // half of the arrival the image's own entrance cannot do — it is the
                        // surface changing colour, not the content moving.
                        'transition-colors',
                        code ? 'bg-white' : 'bg-background-subtle',
                    )}
                    style={{ width: QR_SIZE + 24, height: QR_SIZE + 24 }}
                >
                    {code ? (
                        /*
                         * `unoptimized`, as everywhere this endpoint is used: the API renders one
                         * PNG per text, so there is nothing to resize, and it keeps the API host
                         * out of `remotePatterns` — that list is the set of hosts the optimiser may
                         * *fetch*, not the set a page may link to.
                         */
                        <Image
                            src={qrImageUrl(code)}
                            alt={t('auth_qr_alt')}
                            width={QR_SIZE}
                            height={QR_SIZE}
                            unoptimized
                            // `RISE`, and legitimately: the plate's box is fixed in every state, so
                            // the 8px travel moves nothing around it. Without an entrance the code
                            // replaces a spinner in one frame, which reads as a glitch rather than
                            // as the thing the reader has been waiting for.
                            className={cn('block', RISE)}
                            // The image the network never delivered — see `brokenText`.
                            onError={() => setBrokenText(code)}
                        />
                    ) : view === 'retry' ? (
                        <Button
                            data-testid="auth-qr-retry"
                            variant="secondary"
                            size="small"
                            onClick={retry}
                        >
                            {t('common_retry')}
                        </Button>
                    ) : (
                        <Spinner className="size-6" />
                    )}
                </div>

                {/*
                 * `role="status"` — a polite live region, and the only thing that makes this panel
                 * usable without sight. Every transition here is asynchronous and none of them is
                 * announced by anything else: the code arriving, the mint failing, the phone
                 * approving. A sighted reader watches the plate; this is that, said out loud.
                 */}
                {caption && (
                    <p
                        role="status"
                        className="type-dense-default text-pretty text-center text-text-body"
                    >
                        {caption}
                    </p>
                )}

                {/*
                 * The two screenshots, and the sentence above only summarises them: the art is
                 * what actually points at the button (step 1) and the menu row (step 2), with the
                 * numbers drawn into it. Legacy shows the same pair for the same reason.
                 *
                 * Dimmed — not unmounted — once the phone has approved. They are instructions for
                 * a step already taken, so they should stop competing with "Signing in…"; but
                 * removing them shortens the card by 160px at the exact moment it is about to be
                 * dismissed, and a dialog that re-centres itself on the way out reads as a bug.
                 * Receding is the same statement without the reflow.
                 *
                 * `alt` carries the step rather than being decorative: this is the only place the
                 * app says *where* the button is, so an empty `alt` would leave a screen-reader
                 * user with the summary and nothing else.
                 */}
                <div
                    className={cn(
                        'grid w-full grid-cols-2 gap-2 transition-opacity',
                        isSigningIn && 'opacity-40',
                    )}
                >
                    {QR_SIGN_IN_STEPS.map((step, index) => (
                        <Image
                            key={step.src}
                            src={step.src}
                            alt={t(`auth_qr_step_${index + 1}_alt`)}
                            width={step.width}
                            height={step.height}
                            // `w-full h-auto` with the intrinsic box declared above: the box is
                            // the widest column these ever get (`/login`'s card), so the dialog
                            // scales them down and neither placement upscales.
                            className="h-auto w-full rounded-lg"
                            // Two 15 KB local files that are *instructions* — the card is not
                            // finished until they are on it, so they do not get to arrive late.
                            priority
                        />
                    ))}
                </div>
            </div>

            {/*
             * The socket delivered a session and storing it still failed — the tenth account, or a
             * `/me` that would not load. `loginMethod` is `'qr'` by then, which is not `'email'`,
             * so the social block is the one that owns it.
             */}
            <AuthErrorMessage forMethod="social" />
        </div>
    )
}
