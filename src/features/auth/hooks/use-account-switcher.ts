'use client'

import { useAuthStore } from '../store/auth-store'

/**
 * Raise the account switcher.
 *
 * A hook rather than an exported store, so a host outside the feature (the account
 * drawer today) opens the dialog without reaching into `auth-store` — the same shape
 * `useRequireAuth` has. The dialog itself is mounted once in `app/session-providers.tsx`.
 *
 * It does **not** gate on being signed in: a guest has no second account to switch to,
 * so the caller wraps this in `useRequireAuth` and gets a sign-in prompt instead.
 */
export function useAccountSwitcher() {
    return useAuthStore(s => s.openAccountSwitcher)
}
