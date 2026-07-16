import type { AccountUser } from '@shared/lib/api/token'
import { create } from 'zustand'

export type LoginMethod =
    | 'google'
    | 'apple'
    | 'facebook'
    | 'twitter'
    | 'tiktok'
    | 'telegram'
    | 'line'
    | 'email'
    | 'qr'
    | null

interface AuthState {
    currentUser: AccountUser | null
    isLoading: boolean // initial bootstrap
    isLoadingAction: boolean // an in-flight sign-in
    turnstileSiteKey: string | null
    loginMethod: LoginMethod
    dialogs: { login: boolean; switchAccount: boolean }

    setCurrentUser: (u: AccountUser | null) => void
    setLoading: (v: boolean) => void
    setLoadingAction: (v: boolean) => void
    setTurnstileSiteKey: (k: string | null) => void
    setLoginMethod: (m: LoginMethod) => void
    openDialog: (d: 'login' | 'switchAccount') => void
    closeDialogs: (d?: 'login' | 'switchAccount') => void
}

export const useAuthStore = create<AuthState>(set => ({
    currentUser: null,
    isLoading: true,
    isLoadingAction: false,
    turnstileSiteKey: null,
    loginMethod: null,
    dialogs: { login: false, switchAccount: false },

    setCurrentUser: currentUser => set({ currentUser }),
    setLoading: isLoading => set({ isLoading }),
    setLoadingAction: isLoadingAction => set({ isLoadingAction }),
    setTurnstileSiteKey: turnstileSiteKey => set({ turnstileSiteKey }),
    setLoginMethod: loginMethod => set({ loginMethod }),
    openDialog: d => set(s => ({ dialogs: { ...s.dialogs, [d]: true } })),
    closeDialogs: d =>
        set(s =>
            d
                ? { dialogs: { ...s.dialogs, [d]: false } }
                : { dialogs: { login: false, switchAccount: false } },
        ),
}))
