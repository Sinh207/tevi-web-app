'use client'

import { ApiError } from '@shared/lib/api/errors'
import { setTurnstileTokens } from '@shared/lib/api/request-context'
import {
    type AccountUser,
    addOrUpdateAccount,
    clearTokens,
    getAccessToken,
    getActiveAccountId,
    purgeAnonymousAccounts,
    removeAccount,
    setActiveAccount,
    updateAccountUser,
} from '@shared/lib/api/token'
import { initDeviceInfo } from '@shared/lib/device-info'
import { getFirebaseAuth } from '@shared/lib/firebase'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { authApi, type TokenResponse } from '../api/auth-api'
import { useAccounts } from '../hooks/use-accounts'
import { type LoginMethod, useAuthStore } from '../store/auth-store'

interface AuthContextValue {
    currentUser: AccountUser | null
    isAuthenticated: boolean
    isAnonymous: boolean
    isLoading: boolean
    isLoadingAction: boolean
    accounts: ReturnType<typeof useAccounts>['accounts']
    activeId: string | null
    signInWithAnonymous: () => Promise<void>
    signInWithGoogle: (payload: { access_token: string; id_token?: string }) => Promise<void>
    signInWithEmail: (payload: { email: string; password: string }) => Promise<void>
    signOut: () => Promise<void>
    switchAccount: (id: string) => Promise<void>
    removeAccount: (id: string) => void
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function accountIdOf(res: TokenResponse): string {
    const uid = (res.user?.id ?? res.user?.uid) as string | number | undefined
    return String(uid ?? getActiveAccountId() ?? 'me')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const { accounts, activeId } = useAccounts()
    const {
        currentUser,
        isLoading,
        isLoadingAction,
        loginMethod,
        setCurrentUser,
        setLoading,
        setLoadingAction,
        setLoginMethod,
        setTurnstileSiteKey,
    } = useAuthStore()

    const bootstrapped = useRef(false)

    const isAuthenticated = Boolean(currentUser?.id && !currentUser?.anonymous)
    const isAnonymous = Boolean(currentUser?.id && currentUser?.anonymous)

    const refreshUser = useCallback(async () => {
        // Envelope already unwrapped by the axios interceptor → this is the user.
        const user = (await authApi.getMe()) as AccountUser
        setCurrentUser(user)
        const id = getActiveAccountId()
        if (id) updateAccountUser(id, user)
    }, [setCurrentUser])

    const signInWithAnonymous = useCallback(async () => {
        const auth = await getFirebaseAuth()
        const { signInAnonymously } = await import('firebase/auth')
        const cred = await signInAnonymously(auth)
        const firebaseToken = await cred.user.getIdToken()
        const res = await authApi.connectAnonymous(firebaseToken)
        addOrUpdateAccount({
            id: accountIdOf(res),
            access_token: res.access_token,
            refresh_token: res.refresh_token,
            expires_in: res.expires_in,
            user: (res.user as AccountUser) ?? { id: accountIdOf(res), anonymous: true },
        })
        await refreshUser()
    }, [refreshUser])

    const handleTokenResponse = useCallback(
        async (res: TokenResponse) => {
            addOrUpdateAccount({
                id: accountIdOf(res),
                access_token: res.access_token,
                refresh_token: res.refresh_token,
                expires_in: res.expires_in,
                user: res.user as AccountUser,
            })
            await refreshUser()
        },
        [refreshUser],
    )

    /** Wrap a sign-in call: set method, handle Turnstile (406), surface errors. */
    const runSignIn = useCallback(
        async (method: LoginMethod, call: () => Promise<TokenResponse>) => {
            setLoadingAction(true)
            setLoginMethod(method)
            try {
                const res = await call()
                await handleTokenResponse(res)
            } catch (error) {
                if (error instanceof ApiError && error.status === 406) {
                    // Cloudflare Turnstile challenge required.
                    const t = await authApi.getTurnstile()
                    setTurnstileSiteKey(t.site_key)
                    return
                }
                throw error
            } finally {
                setLoadingAction(false)
            }
        },
        [handleTokenResponse, setLoadingAction, setLoginMethod, setTurnstileSiteKey],
    )

    const signInWithGoogle = useCallback(
        (payload: { access_token: string; id_token?: string }) =>
            runSignIn('google', () => authApi.connectProvider('google', payload)),
        [runSignIn],
    )

    const signInWithEmail = useCallback(
        (payload: { email: string; password: string }) =>
            runSignIn('email', () => authApi.userLogin(payload)),
        [runSignIn],
    )

    const switchAccount = useCallback(
        async (id: string) => {
            setActiveAccount(id)
            await refreshUser()
        },
        [refreshUser],
    )

    const signOut = useCallback(async () => {
        try {
            await authApi.logout()
        } catch {
            // ignore — proceed to local cleanup
        }
        const id = getActiveAccountId()
        if (id) removeAccount(id)
        // If no accounts remain, drop everything and re-establish an anon session.
        if (!getActiveAccountId()) {
            clearTokens()
            setCurrentUser(null)
            setTurnstileTokens({ token: undefined, challenge: undefined })
            await signInWithAnonymous()
        } else {
            await refreshUser()
        }
    }, [refreshUser, setCurrentUser, signInWithAnonymous])

    // Bootstrap once on mount.
    useEffect(() => {
        if (bootstrapped.current) return
        bootstrapped.current = true
        ;(async () => {
            setLoading(true)
            try {
                await initDeviceInfo()
                if (getAccessToken()) {
                    await refreshUser()
                } else {
                    await signInWithAnonymous()
                }
            } catch {
                // leave unauthenticated; UI can retry via login
            } finally {
                setLoading(false)
            }
        })()
    }, [refreshUser, signInWithAnonymous, setLoading])

    // Once authenticated: purge the leftover anonymous session and redirect
    // away from auth routes.
    useEffect(() => {
        if (!isAuthenticated) return
        purgeAnonymousAccounts()
        if (typeof window === 'undefined') return
        const p = window.location.pathname
        if (p === '/login' || p === '/login/email' || p === '/signup') router.replace('/')
    }, [isAuthenticated, router])

    const value = useMemo<AuthContextValue>(
        () => ({
            currentUser,
            isAuthenticated,
            isAnonymous,
            isLoading,
            isLoadingAction,
            accounts,
            activeId,
            signInWithAnonymous,
            signInWithGoogle,
            signInWithEmail,
            signOut,
            switchAccount,
            removeAccount,
            refreshUser,
        }),
        [
            currentUser,
            isAuthenticated,
            isAnonymous,
            isLoading,
            isLoadingAction,
            accounts,
            activeId,
            signInWithAnonymous,
            signInWithGoogle,
            signInWithEmail,
            signOut,
            switchAccount,
            refreshUser,
        ],
    )

    // Keep loginMethod referenced (used by turnstile replay in a later step).
    void loginMethod

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
    return ctx
}
