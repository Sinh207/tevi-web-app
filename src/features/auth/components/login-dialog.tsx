'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { eventBus } from '@shared/lib/event-bus'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth-store'
import { LoginForm } from './login-form'

/**
 * The sign-in prompt a guarded action raises — see `useRequireAuth`.
 *
 * The store already had a `dialogs.login` flag and `useRequireAuth` already set it,
 * but nothing rendered it: a guest tapping a guarded action got no prompt and no
 * error, just an action that quietly did nothing. Gating the *action* rather than
 * the route is deliberate (see the client's dead-account handling) — whatever the
 * visitor was reading stays on screen behind this.
 *
 * Mounted from `app/session-providers.tsx` rather than from `AuthProvider` itself: this
 * imports `LoginForm`, which reads `useAuth`, so rendering it from inside the
 * provider would be a genuine import cycle.
 *
 * Only the frame lives here — the surface, the way out, and closing on success. The
 * heading, the brand mark and the consent line belong to whichever **step** is showing,
 * so `LoginForm` owns them: on `/login` a sub-step replaces the whole card, and a dialog
 * whose chrome outlives its content ends up captioned "Sign in to continue" over a
 * password-reset form, with an account-creation consent line under it.
 */
export function LoginDialog() {
    const open = useAuthStore(s => s.isLoginDialogOpen)
    const close = useAuthStore(s => s.closeLoginDialog)
    /**
     * Close on **any** successful sign-in, not just the one path that reported it.
     *
     * This used to be an `onSuccess` prop threaded down to `EmailSignInForm` — so signing
     * in with email closed the dialog and signing in with any of the other seven methods
     * left it sitting there over an app that was already logged in. The providers never had
     * a callback to call.
     *
     * `auth:signed-in` is emitted by `runSignIn`, which every real sign-in goes through, and
     * only by it: minting an anonymous session calls `connectAnonymous` directly, so
     * bootstrap cannot fire this. It was a declared event with an emitter and no listener —
     * this is the listener, and it means a ninth method added later closes the dialog
     * without anyone remembering to wire it.
     */
    useEffect(() => {
        eventBus.on('auth:signed-in', close)
        return () => eventBus.off('auth:signed-in', close)
    }, [close])

    return (
        <Dialog open={open} onOpenChange={next => !next && close()}>
            {/* `background-elevated`, overriding the DS dialog's `background-subtle`.
                Subtle is `zinc-100` and so is `--button-secondary-bg`, so the eight sign-in
                buttons were **the exact same colour as the surface behind them** — measured
                identical in both themes, `rgb(244,244,245)` and `rgb(24,24,27)` — leaving a
                1px border to do all the work. Elevated is what `/login`'s card uses, which
                is the right answer twice over: it restores the step, and it makes the dialog
                visibly the same object as the page. */}
            <DialogContent className="bg-background-elevated">
                <LoginForm />

                {/* Esc and the backdrop already close this, but neither is visible, and this
                    dialog appears in front of something the visitor was doing rather than
                    because they asked for it. A way out should be on screen.

                    **Last in the DOM, first in nothing.** It is positioned into the corner,
                    so its place in the source is free — and base-ui focuses the first
                    focusable element on open. With the close button written at the top, the
                    thing focused when a sign-in dialog appeared was the way out of it, ring
                    and all. Now that is "Sign in with Apple". */}
                <DialogCloseButton
                    data-testid="auth-login-close"
                    className="absolute end-2 top-2"
                />
            </DialogContent>
        </Dialog>
    )
}
