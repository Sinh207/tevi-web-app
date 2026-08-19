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
} from './lib/account-profile'
export { PASSWORD_CONTAINER } from './lib/container'
// The password settings page's URL — the account drawer both links to it and marks the row
// that leads to it, so the path cannot be a literal at either call site.
export { PASSWORD_SETTINGS_PATH } from './lib/routes'
// `useAccounts` stays internal: `useAuth()` already exposes `accounts`/`activeId`, and two
// public ways to read the same store is two things to keep in step for no gain.
export { AuthProvider, type SignInResult, useAuth } from './providers/auth-provider'
