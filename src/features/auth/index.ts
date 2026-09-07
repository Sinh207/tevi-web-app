import { authApi } from './api/auth-api'

export { AccountSwitcherDialog } from './components/account-switcher-dialog'
export { LoginDialog } from './components/login-dialog'
export { LoginForm } from './components/login-form'
export { LoginScreen } from './components/login-screen'
export { PasswordSettings } from './components/password/password-settings'
// The brand cover over the session bootstrap. Composed by `app/session-providers.tsx`, so it
// reaches a route only if that route mounts a session at all — never a `/app/*` webview.
export { SplashGate } from './components/splash-gate'
export { useAccountSwitcher } from './hooks/use-account-switcher'
/**
 * One narrow function off the auth model, not the model itself.
 *
 * `validate-display-name` sits on the **auth** base (`${W_API}/auth`), so it cannot live in
 * `channelApi`, and the create-space form in `features/channel` needs it. Exporting `authApi`
 * wholesale would invite components to call axios directly, which is what the boundary rule exists
 * to stop — so the barrel widens by exactly the one method that has a caller.
 */
export const validateDisplayName = (displayName: string, signal?: AbortSignal) =>
    authApi.validateDisplayName(displayName, signal)

/**
 * `/settings/two-step-verification` — the management screen for that same passcode.
 *
 * The screen, and nothing under it: not `twoFaApi`, not `useTwoFaSetup`, not `useTwoFaChange`. Same
 * rule the dialog above states and a stronger case for it — the four endpoints behind this one
 * *create, replace and delete* a credential, and a consumer holding them could build a version that
 * turns the factor off without ever asking for the passcode. The gating is the screen's, so the
 * screen is what is exported.
 */
export { TwoFaSettings } from './components/two-fa/two-fa-settings'
/**
 * The passcode gate in front of a money action — `features/payout`'s withdrawal screen raises it.
 *
 * The **dialog** is exported, and nothing else: not `twoFaApi`, not `useTwoFaFlow`. Presenting a
 * credential is one whole interaction, and it is now five steps deep — a consumer holding the
 * endpoints could build a version that verifies but cannot recover, which is the dead end this
 * replaced. The passcode comes back through `onVerified` because the caller has to attach it to its
 * own write; see the prop's own note.
 */
export { TwoStepVerificationDialog } from './components/two-step-verification-dialog'
/**
 * The same rules, for rejecting a name **without** the round trip above.
 *
 * Exported beside `validateDisplayName` because it is the same question asked earlier, and it is
 * exported as a hook plus a pure helper rather than as the model method: a call site that fetched
 * the rules itself would be one more place deciding when they are stale. It can only reject — see
 * the hook — so the pair is not a fork in the source of truth.
 */
export { useDisplayNameRules } from './hooks/use-display-name-rules'
export { useRequireAuth } from './hooks/use-require-auth'
export { useUpdateMe } from './hooks/use-update-me'
// Whether the account has a password — read by `/settings/password` and by the drawer row
// that links to it. Not `/me`: see `authApi.getUserLogin`.
export { useUserLogin } from './hooks/use-user-login'
export {
    accountAutoFollow,
    accountAvatarUrl,
    // The edit-profile form writes the date of birth, and it is the one field on that screen
    // that belongs to `/me` rather than to the channel.
    accountDisplayName,
    accountDob,
    accountEmail,
    accountNsfwSettings,
    accountShowSensitive,
    // Whether a withdrawal has to be confirmed with a passcode. Read by `features/payout`, which
    // pairs it with `TwoStepVerificationDialog` above.
    accountTwoFaPasscode,
    accountUserId,
} from './lib/account-profile'
export { PASSWORD_CONTAINER, TWO_FA_CONTAINER } from './lib/container'
export { type DisplayNameRule, firstBrokenRule } from './lib/display-name-rules'
// The two settings pages' URLs — the account drawer both links to them and marks the row that
// leads to them, so neither path can be a literal at either call site.
export { PASSWORD_SETTINGS_PATH, TWO_FA_SETTINGS_PATH } from './lib/routes'
// `useAccounts` stays internal: `useAuth()` already exposes `accounts`/`activeId`, and two
// public ways to read the same store is two things to keep in step for no gain.
export { AuthProvider, type SignInResult, useAuth } from './providers/auth-provider'
