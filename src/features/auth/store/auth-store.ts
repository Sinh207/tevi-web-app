import { create } from 'zustand'

/**
 * UI state for authentication — and **only** UI state.
 *
 * Nothing here is server data. The signed-in profile lives in the React Query cache
 * (`authKeys.me`), and the tokens and account list live in `shared/lib/api/token.ts`.
 * `currentUser` used to be mirrored here too, which meant the same `/me` body existed in
 * three stores and every sign-out, session-expiry and account switch had to remember to
 * update all three by hand. See the three communication primitives in `CLAUDE.md`.
 */

/**
 * Third-party providers with a working sign-in flow. Add a value when its flow is
 * implemented, not in anticipation — this type is what `connectProvider` is keyed on,
 * so an unreachable value is a code path nothing can produce.
 */
export type SocialProvider =
    | 'google'
    | 'apple'
    | 'facebook'
    | 'twitter'
    | 'tiktok'
    | 'telegram'
    | 'line'

/** How the current sign-in attempt was started. */
export type LoginMethod = SocialProvider | 'email' | null

interface AuthState {
    /** The one-time session bootstrap on first mount is still running. */
    isBootstrapping: boolean
    /** A sign-in attempt is in flight (including a Turnstile replay). */
    isSigningIn: boolean
    /** A deliberate sign-out is in flight. */
    isSigningOut: boolean

    turnstileSiteKey: string | null
    /**
     * Bumped every time a challenge is issued. A Turnstile token is single-use, so a
     * second 406 — a rotated challenge, an expired one — has to face a *fresh* widget;
     * the spent one would never produce another token. Used as a React `key`, so the
     * widget is remounted rather than reset by hand.
     */
    turnstileNonce: number
    loginMethod: LoginMethod

    /**
     * Why the last **sign-in** failed, as a translation key — `null` while one is in
     * flight or has succeeded. Deliberately scoped to sign-in: it is the only auth
     * operation with a form standing in front of it waiting to be told.
     *
     * A translation key rather than a message, so it cannot be rendered untranslated,
     * and so the backend's own words do not reach the screen (see `toSignInErrorKey` in
     * `lib/auth-error.ts` for why that matters). `signInErrorText` below is the one
     * scoped exception.
     *
     * State rather than a thrown error, because the attempt that fails is not always one
     * a caller is still awaiting: a Turnstile challenge parks the sign-in and replays it
     * later, by which time the form's promise has resolved with `'challenge'` and its
     * `catch` is gone. It also survives the form unmounting while the widget is up, which
     * is exactly when it gets set.
     */
    signInErrorKey: string | null

    /**
     * The backend's own sentence for the failure, when there is one worth showing —
     * see `providerSignInErrorText`. Rendered *instead of* `signInErrorKey`, which stays
     * set as the fallback, so a surface reading only the key still says something.
     *
     * Only ever non-null for a provider (`v1/connect/*`) attempt. The email form's
     * failures stay on translation keys, which is what keeps 400 and 401 indistinguishable
     * there.
     */
    signInErrorText: string | null

    /** Raised by `useRequireAuth` when a guest triggers a guarded action. */
    isLoginDialogOpen: boolean

    /**
     * The account switcher is up. Raised by `useAccountSwitcher`.
     *
     * Here rather than in the drawer that opens it today, for the same reason
     * `isLoginDialogOpen` is: the switcher is mounted once at the provider root, and
     * more than one control will want to raise it (the drawer row now, the top bar's
     * avatar later) without any of them owning the state.
     */
    isAccountSwitcherOpen: boolean

    setBootstrapping: (v: boolean) => void
    setSigningIn: (v: boolean) => void
    setSigningOut: (v: boolean) => void
    setTurnstileSiteKey: (k: string | null) => void
    setLoginMethod: (m: LoginMethod) => void
    /**
     * Both halves of the sign-in error at once — one setter rather than two, so the key
     * and the message it may override cannot be left describing different attempts.
     */
    setSignInError: (key: string | null, text?: string | null) => void
    openLoginDialog: () => void
    closeLoginDialog: () => void
    openAccountSwitcher: () => void
    closeAccountSwitcher: () => void
}

export const useAuthStore = create<AuthState>(set => ({
    isBootstrapping: true,
    isSigningIn: false,
    isSigningOut: false,
    turnstileSiteKey: null,
    turnstileNonce: 0,
    loginMethod: null,
    signInErrorKey: null,
    signInErrorText: null,
    isLoginDialogOpen: false,
    isAccountSwitcherOpen: false,

    setBootstrapping: isBootstrapping => set({ isBootstrapping }),
    setSigningIn: isSigningIn => set({ isSigningIn }),
    setSigningOut: isSigningOut => set({ isSigningOut }),
    // Issuing a challenge bumps the nonce; clearing one leaves it alone, so the next
    // challenge still lands on a key nothing has rendered under before.
    setTurnstileSiteKey: turnstileSiteKey =>
        set(s => ({
            turnstileSiteKey,
            turnstileNonce: turnstileSiteKey ? s.turnstileNonce + 1 : s.turnstileNonce,
        })),
    setLoginMethod: loginMethod => set({ loginMethod }),
    setSignInError: (signInErrorKey, signInErrorText = null) =>
        set({ signInErrorKey, signInErrorText }),
    // Adding an account is a sign-in, so the switcher hands over to the login dialog
    // rather than stacking under it — two overlays over one another, one of them
    // listing the accounts you are about to add to.
    openLoginDialog: () => set({ isLoginDialogOpen: true, isAccountSwitcherOpen: false }),
    closeLoginDialog: () => set({ isLoginDialogOpen: false }),
    openAccountSwitcher: () => set({ isAccountSwitcherOpen: true }),
    closeAccountSwitcher: () => set({ isAccountSwitcherOpen: false }),
}))
