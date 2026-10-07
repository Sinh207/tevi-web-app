'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { clearAgeConsent } from '@shared/lib/age-consent'
import { ApiError } from '@shared/lib/api/errors'
import { clearETagScope } from '@shared/lib/api/interceptors/etag'
import { clearTurnstileTokens, setTurnstileTokens } from '@shared/lib/api/request-context'
import {
    type AccountUser,
    addOrUpdateAccount,
    canAddAccount,
    clearTokens,
    getAccessToken,
    getActiveAccountId,
    MaxAccountsError,
    purgeAnonymousAccounts,
    removeAccount,
    setActiveAccount,
    syncFromStorage,
} from '@shared/lib/api/token'
import { initDeviceInfo, primeDeviceInfo } from '@shared/lib/device-info'
import { eventBus } from '@shared/lib/event-bus'
import { getFirebaseAuth } from '@shared/lib/firebase'
import { LOCKS, withLock } from '@shared/lib/locks'
import { clearNsfwConsent } from '@shared/lib/nsfw-consent'
import { clearRecentCreators } from '@shared/lib/search-recent-creators'
import { clearSearchRecents } from '@shared/lib/search-recents'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { authApi, authKeys, type TokenResponse, type Username } from '../api/auth-api'
import { useAccounts } from '../hooks/use-accounts'
import { foldAccountUser } from '../lib/account-fold'
import { accountIdOf } from '../lib/account-id'
import { providerSignInErrorText, toSignInErrorKey } from '../lib/auth-error'
import { type LoginMethod, type SocialProvider, useAuthStore } from '../store/auth-store'

/** Routes that exist only to sign in — leave them once there is a real session. */
const AUTH_ROUTES = new Set(['/login'])

/**
 * What a sign-in attempt actually did.
 *
 * `challenge` is not a failure and not a success: Cloudflare wants a Turnstile solved
 * before it will judge the credentials, so the attempt is *parked*, not finished. It has
 * to be its own outcome — resolving like a success made the login form fire `onSuccess`
 * and dismiss itself over a user who was never signed in.
 *
 * The parked attempt is replayed by `AuthProvider` when the widget produces a token
 * (`auth:turnstile-passed`), so the caller does nothing but wait.
 */
export type SignInResult = 'signed-in' | 'challenge'

interface AuthContextValue {
    currentUser: AccountUser | null
    isAuthenticated: boolean
    isAnonymous: boolean
    /** The one-time session bootstrap is still running — nothing is known yet. */
    isBootstrapping: boolean
    /** A sign-in is in flight, including a replay after a Turnstile challenge. */
    isSigningIn: boolean
    /** A deliberate sign-out is in flight. */
    isSigningOut: boolean
    accounts: ReturnType<typeof useAccounts>['accounts']
    activeId: string | null
    /** Cloudflare wants a Turnstile solved; render one for this site key. */
    turnstileSiteKey: string | null
    /** Use as the widget's React `key` — see `turnstileNonce` in the store. */
    turnstileNonce: number
    /** Translation key for why the last sign-in failed, or null. Render it with `t()`. */
    signInErrorKey: string | null
    /**
     * The backend's own sentence for the failure, when a provider sign-in produced one.
     * Show it **instead of** `signInErrorKey`; it is already a sentence, so do not pass it
     * through `t()`. Null for every email failure — see `providerSignInErrorText`.
     */
    signInErrorText: string | null
    /**
     * How the last attempt was started. Read it to put `signInErrorKey` next to the
     * control that produced it — a wrong password reported above the provider row is
     * most of a screen away from the button the user just pressed.
     */
    loginMethod: LoginMethod
    signInWithAnonymous: () => Promise<void>
    /**
     * Exchange a third-party credential for a Tevi session.
     *
     * One method rather than one per provider: every flow ends at the same
     * `v1/connect/<provider>/` call, and the part that genuinely differs — which SDK,
     * which popup, which redirect — belongs with the button that owns it, not on this
     * context. The payload shape is the provider's, so it stays loose here and is
     * pinned where it is built (`components/social-buttons.tsx`).
     */
    signInWithProvider: (
        provider: SocialProvider,
        payload: Record<string, unknown>,
    ) => Promise<SignInResult>
    signInWithEmail: (payload: { email: string; password: string }) => Promise<SignInResult>
    /**
     * Adopt a session the **phone** already obtained — QR sign-in, where the credential arrives
     * over the device room rather than from a request this browser made.
     *
     * Takes the token response instead of making one, which is the whole difference: by the time
     * this is called the backend has already minted the session, so there is nothing left to
     * authenticate and nothing that can be challenged. Everything after that point — the account
     * limit, storing the tokens, fetching `/me`, `auth:signed-in` — is identical to every other
     * method, so it goes through the same `runSignIn` and not around it.
     */
    signInWithQrSession: (session: TokenResponse) => Promise<SignInResult>
    signOut: () => Promise<void>
    switchAccount: (id: string) => Promise<void>
    /** Ends the account's session server-side before dropping it locally. */
    removeAccount: (id: string) => Promise<void>
    refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Fetch one account's profile and fold it into the copy the token store holds — see
 * `foldAccountUser` for what the fold is protecting.
 */
async function fetchMe(accountId: string | null): Promise<AccountUser> {
    const user = (await authApi.getMe(accountId)) as AccountUser
    return foldAccountUser(accountId, user)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { accounts, activeId } = useAccounts()

    // Selected field by field, not destructured off `useAuthStore()`. Subscribing to the
    // whole store re-ran this component and rebuilt the context value on every unrelated
    // change — opening the login dialog re-rendered every `useAuth()` consumer.
    // (`children` is safe either way: it arrives as a prop, so React skips that subtree.)
    const isBootstrapping = useAuthStore(s => s.isBootstrapping)
    const isSigningIn = useAuthStore(s => s.isSigningIn)
    const isSigningOut = useAuthStore(s => s.isSigningOut)
    const turnstileSiteKey = useAuthStore(s => s.turnstileSiteKey)
    const turnstileNonce = useAuthStore(s => s.turnstileNonce)
    const signInErrorKey = useAuthStore(s => s.signInErrorKey)
    const signInErrorText = useAuthStore(s => s.signInErrorText)
    const loginMethod = useAuthStore(s => s.loginMethod)
    const setBootstrapping = useAuthStore(s => s.setBootstrapping)
    const setSigningIn = useAuthStore(s => s.setSigningIn)
    const setSigningOut = useAuthStore(s => s.setSigningOut)
    const setLoginMethod = useAuthStore(s => s.setLoginMethod)
    const setTurnstileSiteKey = useAuthStore(s => s.setTurnstileSiteKey)
    const setSignInError = useAuthStore(s => s.setSignInError)

    /**
     * The rendered profile, straight out of the query cache.
     *
     * Server state belongs to TanStack Query, not to Zustand (see the three primitives in
     * `CLAUDE.md`). It used to be mirrored into the store as well, so the same `/me` body
     * lived in three places and every sign-out, expiry and account switch had to remember
     * to update all of them; the one that forgot was the bug.
     *
     * Keyed on the active account, which makes two behaviours fall out for free: an
     * account switch — in this tab or another — re-keys the query and refetches, and
     * having no account at all yields no data, so the anonymous and signed-out states
     * need no explicit clearing.
     */
    const { data: currentUser = null } = useQuery({
        queryKey: authKeys.me(activeId),
        queryFn: () => fetchMe(activeId),
        enabled: Boolean(activeId),
    })

    const bootstrapped = useRef(false)
    /**
     * The sign-in Cloudflare interrupted, held so it can be run again verbatim once the
     * widget hands back a token. A ref rather than state: replaying is a side effect, and
     * nothing renders differently because an attempt is parked — `turnstileSiteKey`
     * already carries that.
     */
    const pendingSignIn = useRef<(() => Promise<TokenResponse>) | null>(null)
    const isAuthenticated = Boolean(currentUser?.id && !currentUser?.anonymous)
    const isAnonymous = Boolean(currentUser?.id && currentUser?.anonymous)

    /**
     * Load the active account's profile.
     *
     * Through the query cache rather than straight at axios: this has six callers
     * (bootstrap, after a sign-in, `switchAccount`, `ensureAnonymousSession`, the
     * cross-tab resync, `signOut`) and several of them can fire at once — a page load
     * racing a `storage` event from another tab meant two `/me` requests for one
     * answer. `fetchQuery` collapses concurrent calls on the same key into a single
     * request, and leaves the result somewhere `queryClient.clear()` can reach when a
     * session dies.
     *
     * The account is read once and then *pinned* on the request (inside `fetchMe`).
     * Reading it here and letting the interceptor pick a bearer later left a window —
     * a switch, a cross-tab sync, a sign-in landing — in which account B's profile
     * came back and was written under account A's key.
     *
     * Writes to the same cache entry the `useQuery` above reads, so the rendered user
     * updates as a consequence rather than through a second setter.
     */
    const refreshUser = useCallback(async () => {
        const id = getActiveAccountId()
        await queryClient.fetchQuery({
            queryKey: authKeys.me(id),
            queryFn: () => fetchMe(id),
            staleTime: 0,
        })
    }, [queryClient])

    const signInWithAnonymous = useCallback(async () => {
        const [auth, { signInAnonymously }] = await Promise.all([
            getFirebaseAuth(),
            import('firebase/auth'),
        ])
        const cred = await signInAnonymously(auth)
        const firebaseToken = await cred.user.getIdToken()
        const res = await authApi.connectAnonymous(firebaseToken)
        const id = accountIdOf(res)
        addOrUpdateAccount({
            id,
            access_token: res.access_token,
            refresh_token: res.refresh_token,
            expires_in: res.expires_in,
            // `anonymous` is stated here rather than taken from the response: we know
            // how this session was minted, and nothing downstream can tell from the
            // profile alone. See `mergeAccountUser` for what depends on it.
            user: { ...(res.user as AccountUser | undefined), id, anonymous: true },
        })
        await refreshUser()
    }, [refreshUser])

    /**
     * Make sure this **device** has a session — mint an anonymous one only if it
     * genuinely has none.
     *
     * The check has to happen inside a cross-tab lock, after re-reading the store:
     * opening three tabs at once ran three independent bootstraps, each creating its
     * own anonymous account and each persisting the whole account map over the
     * others' write. Whoever gets the lock second finds the session the first one
     * made and just loads the user.
     */
    const ensureAnonymousSession = useCallback(
        () =>
            withLock(LOCKS.anonymous, async () => {
                syncFromStorage()
                if (getActiveAccountId()) {
                    await refreshUser()
                    return
                }
                await signInWithAnonymous()
            }),
        [refreshUser, signInWithAnonymous],
    )

    /**
     * A sign-in succeeded — store the account it produced.
     *
     * The limit check can only happen *after* the call: the id comes from the
     * response, and a sign-in against an account already held is a legitimate
     * re-login that must still work even when the store is full. So by the time we
     * know to refuse, the backend has minted a session nothing here will keep.
     *
     * Hand it back rather than letting it linger — but hand back *only* it. The
     * revoke presents the new token and an empty body precisely so it cannot resolve
     * to any other session; see `authApi.revokeToken`. Failing to revoke leaves a
     * token that expires on its own, which is a far smaller problem than revoking
     * the wrong one, so this stays best-effort and never blocks the error the user
     * actually needs to see.
     */
    const handleTokenResponse = useCallback(
        async (res: TokenResponse) => {
            const id = accountIdOf(res)
            if (!canAddAccount(id)) {
                await authApi.revokeToken(res.access_token).catch(() => {
                    // Best effort: it expires by itself, and nothing local depends
                    // on the outcome.
                })
                throw new MaxAccountsError()
            }
            addOrUpdateAccount({
                id,
                access_token: res.access_token,
                refresh_token: res.refresh_token,
                expires_in: res.expires_in,
                user: res.user as AccountUser,
            })
            await refreshUser()
        },
        [refreshUser],
    )

    /** Forget the parked attempt and take the widget down with it. */
    const clearChallenge = useCallback(() => {
        pendingSignIn.current = null
        clearTurnstileTokens()
        setTurnstileSiteKey(null)
    }, [setTurnstileSiteKey])

    /**
     * Wrap a sign-in call: set method, handle Turnstile (406), surface errors.
     *
     * **HTTP 406 means "solve a Turnstile first", not "wrong credentials".** The call is
     * parked in `pendingSignIn` and the site key goes into the store so a widget can be
     * rendered; `'challenge'` comes back so the caller knows not to treat this as a
     * sign-in. `challenge_id` rides along on the `X-Turnstile-Challenge` header — the
     * backend pairs it with the token the widget will produce, so fetching the challenge
     * without pinning it makes the replay unverifiable.
     */
    const runSignIn = useCallback(
        async (method: LoginMethod, call: () => Promise<TokenResponse>) => {
            setSigningIn(true)
            setLoginMethod(method)
            setSignInError(null)
            try {
                const res = await call()
                await handleTokenResponse(res)
                // The token was single-use and has now been redeemed.
                clearChallenge()
                eventBus.emit('auth:signed-in', { userId: accountIdOf(res) })
                return 'signed-in' as const
            } catch (error) {
                if (error instanceof ApiError && error.status === 406) {
                    const challenge = await authApi.getTurnstile()
                    if (challenge.challenge_id) {
                        setTurnstileTokens({ challenge: challenge.challenge_id })
                    }
                    pendingSignIn.current = call
                    setTurnstileSiteKey(challenge.site_key)
                    return 'challenge' as const
                }
                // Any other failure ends the attempt. Leaving the widget up with a
                // spent token and a parked call nothing will replay stranded the
                // user on a challenge that could never resolve.
                clearChallenge()
                // A provider failure may carry a sentence no key of ours can express
                // ("Please use a different Google account"). The email form never does —
                // its keys are what keep 400 and 401 indistinguishable there.
                setSignInError(
                    toSignInErrorKey(error),
                    method && method !== 'email' ? providerSignInErrorText(error) : null,
                )
                throw error
            } finally {
                setSigningIn(false)
            }
        },
        [
            clearChallenge,
            handleTokenResponse,
            setSignInError,
            setSigningIn,
            setLoginMethod,
            setTurnstileSiteKey,
        ],
    )

    const signInWithProvider = useCallback(
        (provider: SocialProvider, payload: Record<string, unknown>) =>
            runSignIn(provider, () => authApi.connectProvider(provider, payload)),
        [runSignIn],
    )

    const signInWithEmail = useCallback(
        (payload: { email: string; password: string }) => {
            // The API identifies people by a tagged pair, not a bare field. Wrapped
            // here so callers keep passing what a login form actually collects.
            const username: Username = { kind: 'email', value: payload.email }
            return runSignIn('email', () =>
                authApi.userLogin({ username, password: payload.password }),
            )
        },
        [runSignIn],
    )

    /**
     * The phone approved the code. See the note on the context type for why this takes a session
     * rather than fetching one.
     *
     * `runSignIn` wraps a call that has already happened, so its 406 branch is unreachable here —
     * a challenge is something the gateway raises on a *request*, and this browser made none. What
     * is reachable is the rest of it: `MaxAccountsError` when ten accounts are already stored (the
     * token is then revoked rather than left running), a `/me` that will not load, and the
     * `auth:signed-in` that closes `LoginDialog`. Reimplementing that here is how a tenth account
     * would silently succeed on this one path alone.
     */
    const signInWithQrSession = useCallback(
        (session: TokenResponse) => runSignIn('qr', async () => session),
        [runSignIn],
    )

    /**
     * The widget solved the challenge — run the parked attempt again, now that the axios
     * client has a `X-Turnstile-Token` to send with it. A second 406 re-parks the call
     * and re-renders the widget, which is what a rotated challenge looks like.
     *
     * This is the *only* place a replay's outcome is observable: the caller's promise
     * resolved with `'challenge'` long ago, so there is no `catch` left anywhere else.
     * `runSignIn` has already recorded the reason in `authError` — swallowing here
     * just stops the rejection, it does not hide it.
     */
    useEffect(() => {
        const replay = () => {
            const call = pendingSignIn.current
            if (!call) return
            void runSignIn(useAuthStore.getState().loginMethod, call).catch(() => {})
        }
        eventBus.on('auth:turnstile-passed', replay)
        return () => eventBus.off('auth:turnstile-passed', replay)
    }, [runSignIn])

    /**
     * Act as a different account from here on.
     *
     * **The query cache goes with it.** `/me` is keyed per account, so that one entry
     * would have re-keyed on its own — but nothing else in the app is, and everything
     * currently cached was fetched as the identity that just stopped being active.
     * Serving one person's feed, wallet or messages to another is the same failure the
     * dead-account path already guards against with `clear()`, and it arrives here by a
     * route the user chose rather than one the server forced.
     *
     * Cleared *before* the refetch, so `refreshUser`'s own write survives it. (ETags
     * need no help: their keys are already scoped by account id.)
     *
     * A switch to the account already active is a no-op rather than a cache wipe —
     * `handleSwitch` in the switcher dialog short-circuits too, but any other caller
     * would otherwise pay for a re-fetch of everything to end up where it started.
     */
    const switchAccount = useCallback(
        async (id: string) => {
            if (id === getActiveAccountId()) return
            setActiveAccount(id)
            queryClient.clear()
            await refreshUser()
        },
        [queryClient, refreshUser],
    )

    /**
     * End an account's session and forget everything of its own.
     *
     * Order matters: **revoke before removing**. An account sitting in the switcher
     * has usually not been used for a while, so its access token is very likely
     * expired — and the only thing that can renew it is the refresh token on the
     * record we are about to delete. Dropping the account first leaves nothing to
     * refresh from and the server-side session alive for good.
     *
     * Passing the id is what buys that: the client refreshes *that* account before
     * the call, replays it once on a 401, and if the refresh itself fails then the
     * session was already dead server-side — `handleDeadAccount` has removed the
     * account by the time we get here, and `removeAccount` below is a no-op. Either
     * way the account is gone locally, which is what the caller asked for.
     *
     * The local half is not optional either: the context used to hand out
     * `token.ts`'s `removeAccount` directly, so an account's cached response bodies
     * stayed in IndexedDB and its profile stayed in the query cache — both readable
     * by whoever uses the device next. Its NSFW consent had the same problem and is
     * dropped here too, which is why that store lives in `shared/`.
     */
    const forgetAccount = useCallback(
        async (id: string, opts?: { promote?: boolean }) => {
            await authApi.logout(id).catch(() => {
                // Already dead, offline, or refused. Local cleanup happens regardless
                // — refusing to forget an account because the server did not answer
                // would strand the user signed in to something they cannot use.
            })
            removeAccount(id, opts)
            void clearETagScope(id)
            // Everything else this account left on the device. Consent to see a space's sensitive
            // content is one of them, and it is the one that reads as somebody else's answer if it
            // survives: the next person to use the browser would not be asked.
            clearNsfwConsent(id)
            // The narrower one beside it: which 18+ live events this account said it was old
            // enough for. Same argument, one step sharper — an age confirmation that survives
            // the account reads as the *next* person having answered a question about their age.
            clearAgeConsent(id)
            // The other one: the terms this account typed into `/search`. Same argument as
            // consent above — a search history left on a shared device reads as the next
            // person's, and it is legible at a glance.
            clearSearchRecents(id)
            // …and the creators it opened from there, for the same reason.
            clearRecentCreators(id)
            queryClient.removeQueries({ queryKey: authKeys.me(id) })
        },
        [queryClient],
    )

    const signOut = useCallback(async () => {
        setSigningOut(true)
        try {
            const id = getActiveAccountId()
            // One path for "end this account's session and forget it", so signing out
            // of the account in use and removing one from the switcher cannot drift
            // apart — and so this one gets the same refresh-before-revoke treatment.
            if (id) await forgetAccount(id)
            eventBus.emit('auth:signed-out')
            // If no accounts remain, drop everything and re-establish an anon session.
            if (!getActiveAccountId()) {
                clearTokens()
                clearChallenge()
                // Nothing is signed in now, so whatever this session cached lands in
                // the anonymous scope from here on — including bodies still in flight
                // when the account went away. That bucket is shared with the next
                // visitor. (`currentUser` needs no clearing: with no active account
                // its query is disabled and yields nothing.)
                void clearETagScope(null)
                await ensureAnonymousSession()
            } else {
                await refreshUser()
            }
        } finally {
            setSigningOut(false)
        }
    }, [clearChallenge, ensureAnonymousSession, forgetAccount, refreshUser, setSigningOut])

    // Bootstrap once on mount.
    useEffect(() => {
        if (bootstrapped.current) return
        bootstrapped.current = true
        ;(async () => {
            setBootstrapping(true)
            try {
                // Resolving the device id runs FingerprintJS on a first-ever visit
                // (dynamic import → load → get), and awaiting that chain put three
                // serial steps in front of `/me`.
                //
                // `/me` does not require `device_id` (confirmed with the API team) —
                // only the token-minting endpoints do, and those still await below.
                // So publish the id synchronously when storage already has it (every
                // returning visitor) and let the slow path settle in the background.
                primeDeviceInfo()
                const device = initDeviceInfo()
                if (getAccessToken()) {
                    try {
                        await refreshUser()
                    } catch {
                        // Don't infer from the error what happened to the session —
                        // ask the store. `handleDeadAccount` is the only thing that
                        // removes an account, and it has already run by now. If the
                        // account survived, this was a 500 or a flaky network and the
                        // session is fine; re-minting anonymously there threw away a
                        // valid login and cost a second /me on the way.
                        syncFromStorage()
                        if (!getActiveAccountId()) {
                            await device
                            await ensureAnonymousSession()
                        }
                    }
                } else {
                    await device
                    await ensureAnonymousSession()
                }
            } catch {
                // leave unauthenticated; UI can retry via login
            } finally {
                setBootstrapping(false)
            }
        })()
    }, [ensureAnonymousSession, refreshUser, setBootstrapping])

    /**
     * The session in use died (see `auth:session-expired` in `event-bus.ts`). The axios
     * client has already dropped that account and its cached bodies; this is the rest of
     * the clean-up, in place — no redirect, whatever the visitor was reading stays on
     * screen, and any other account stays in the switcher for them to pick deliberately.
     *
     * The React Query cache has to go with it: it is keyed by query, not by account, so
     * anything fetched as the old identity would otherwise be served to the anonymous one
     * that replaces it.
     *
     * A real session ending is worth saying out loud — the user did nothing and is
     * suddenly a guest. An anonymous token aging out is not: nobody was signed in.
     */
    useEffect(() => {
        const reestablish = ({ wasAnonymous }: { wasAnonymous: boolean }) => {
            // Revoking on sign-out refreshes first, and a refresh that fails arrives
            // here — but "your session expired, sign in again" is the wrong thing to
            // say the instant *after* someone pressed Sign out, and the re-establish
            // below would race the one `signOut` is already doing. Read through
            // `getState()` rather than the selected value: this handler is registered
            // once, so a closed-over boolean would be the one from first render.
            if (useAuthStore.getState().isSigningOut) return
            clearChallenge()
            queryClient.clear()
            // Requests already in the air when the account died land in the anonymous
            // scope, which the next visitor to this device reads.
            void clearETagScope(null)
            if (!wasAnonymous) toast.error(t('auth_session_expired'))
            void ensureAnonymousSession().catch(() => {
                // Offline or the API is down; the next navigation bootstraps again.
            })
        }
        eventBus.on('auth:session-expired', reestablish)
        return () => eventBus.off('auth:session-expired', reestablish)
    }, [clearChallenge, ensureAnonymousSession, queryClient, t])

    /**
     * Another tab changed the token store. This tab's `accounts`/`activeId` have
     * already been re-read (`token.ts` watches `storage`); what is left is the
     * rendered session, which is still whoever *this* tab thought was signed in.
     *
     * Signing out in one tab used to leave the others showing a signed-in shell
     * until their next request 401'd, and switching account in one tab was
     * invisible to the rest.
     *
     * Only one case is left to handle here. A *switch* needs nothing: `currentUser`
     * is keyed on the active account, so `useAccounts` re-rendering with the new id
     * re-keys the query and it refetches on its own. This used to compare the
     * rendered `user.id` against the account key to decide — two different
     * identifiers, which are only equal when the token response happens to carry a
     * user, so it re-fetched needlessly whenever the key came from the JWT `sub`.
     */
    useEffect(() => {
        const resync = () => {
            // The device has no session at all — another tab signed out of the last
            // account. Everything else takes care of itself.
            if (!getActiveAccountId()) void ensureAnonymousSession().catch(() => {})
        }
        eventBus.on('auth:accounts-synced', resync)
        return () => eventBus.off('auth:accounts-synced', resync)
    }, [ensureAnonymousSession])

    // Once authenticated: purge the leftover anonymous session and redirect
    // away from auth routes.
    useEffect(() => {
        if (!isAuthenticated) return
        purgeAnonymousAccounts()
        if (typeof window === 'undefined') return
        if (AUTH_ROUTES.has(window.location.pathname)) router.replace('/')
    }, [isAuthenticated, router])

    const value = useMemo<AuthContextValue>(
        () => ({
            currentUser,
            isAuthenticated,
            isAnonymous,
            isBootstrapping,
            isSigningIn,
            isSigningOut,
            accounts,
            activeId,
            turnstileSiteKey,
            turnstileNonce,
            signInErrorKey,
            signInErrorText,
            loginMethod,
            signInWithAnonymous,
            signInWithProvider,
            signInWithEmail,
            signInWithQrSession,
            signOut,
            switchAccount,
            removeAccount: forgetAccount,
            refreshUser,
        }),
        [
            currentUser,
            isAuthenticated,
            isAnonymous,
            isBootstrapping,
            isSigningIn,
            isSigningOut,
            accounts,
            activeId,
            turnstileSiteKey,
            turnstileNonce,
            signInErrorKey,
            signInErrorText,
            loginMethod,
            signInWithAnonymous,
            signInWithProvider,
            signInWithEmail,
            signInWithQrSession,
            signOut,
            switchAccount,
            forgetAccount,
            refreshUser,
        ],
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
    return ctx
}
