// @vitest-environment jsdom
import { apiClient } from '@shared/lib/api/client'
import { clearETagCache } from '@shared/lib/api/interceptors/etag'
import { clearTurnstileTokens, getTurnstileHeaders } from '@shared/lib/api/request-context'
import {
    type AccountUser,
    addOrUpdateAccount,
    clearTokens,
    getAccount,
    getAccounts,
    getActiveAccountId,
    setActiveAccount,
} from '@shared/lib/api/token'
import { eventBus } from '@shared/lib/event-bus'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/auth-store'
import { AuthProvider, useAuth } from './auth-provider'

/**
 * The provider, driven end to end over a fake transport.
 *
 * This file holds the ordering logic every other auth module is coordinated by —
 * bootstrap, the Turnstile park-and-replay, session death, cross-tab resync — and
 * none of it is reachable from a unit test: the bugs are in *what gets called, in
 * what order, against which module singleton*. So it renders the real provider and
 * scripts the HTTP it sees, the same seam `client.test.ts` uses.
 */

const toastError = vi.hoisted(() => vi.fn())
const routerReplace = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('@shared/lib/firebase', () => ({ getFirebaseAuth: async () => ({}) }))
vi.mock('firebase/auth', () => ({
    signInAnonymously: async () => ({ user: { getIdToken: async () => 'firebase-token' } }),
}))
vi.mock('@fingerprintjs/fingerprintjs', () => ({
    default: { load: async () => ({ get: async () => ({ visitorId: 'device-test' }) }) },
}))

// ── Fake transport, routed by URL ──────────────────────────────────────────

interface Reply {
    status?: number
    data?: unknown
    headers?: Record<string, string>
}

const routes: Array<{ match: string; replies: Reply[] }> = []
let calls: InternalAxiosRequestConfig[] = []

/** Answer requests whose URL contains `match`. The last reply repeats. */
function on(match: string, ...replies: Reply[]) {
    routes.unshift({ match, replies: [...replies] })
}

function callsTo(match: string) {
    return calls.filter(c => String(c.url).includes(match))
}

const adapter: AxiosAdapter = config => {
    calls.push(config)
    const route = routes.find(r => String(config.url).includes(r.match))
    const reply = (route &&
        (route.replies.length > 1 ? route.replies.shift() : route.replies[0])) ?? {
        data: { data: {} },
    }
    const { status = 200, data = {}, headers = {} } = reply
    const response = { status, statusText: '', data, headers, config } as unknown as AxiosResponse
    if (status >= 200 && status < 300) return Promise.resolve(response)
    return Promise.reject(new AxiosError(`status ${status}`, undefined, config, {}, response))
}

// ── Harness ────────────────────────────────────────────────────────────────

let auth: ReturnType<typeof useAuth>
/** The client the provider is running against — for asserting on what a switch keeps. */
let queryClient: QueryClient

function Probe() {
    auth = useAuth()
    return null
}

function renderAuth() {
    queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <Probe />
            </AuthProvider>
        </QueryClientProvider>,
    )
}

/**
 * Wait for the bootstrap effect to settle.
 *
 * The generous timeout is not slack for a slow assertion — `waitFor` polls and returns
 * the moment the condition holds, so it costs nothing when things are healthy. It is
 * headroom for a loaded machine: bootstrap chains several awaits through the fake
 * adapter, and at the 1s default these went red purely because a dev server was running
 * alongside. A CI runner is shared in exactly the same way.
 */
const WAIT = { timeout: 5000 }
const settled = () => waitFor(() => expect(auth.isBootstrapping).toBe(false), WAIT)

const ME = '/auth/v1/me/'
const TOKEN = '/auth/v1/token/'
const LOGIN = '/auth/v1/user-login/login/'
const LOGOUT = '/auth/v1/logout/'
const TURNSTILE = '/auth/v1/turnstile/'
const CONNECT_APPLE = '/auth/v1/connect/apple/'

function storedAccount(id: string, user: AccountUser = { id }) {
    addOrUpdateAccount({
        id,
        access_token: `at-${id}`,
        refresh_token: `rt-${id}`,
        expires_in: 3600,
        user,
    })
}

beforeEach(async () => {
    localStorage.clear()
    clearTokens()
    clearTurnstileTokens()
    await clearETagCache()
    routes.length = 0
    calls = []
    toastError.mockClear()
    routerReplace.mockClear()
    apiClient.defaults.adapter = adapter
    useAuthStore.setState({
        isBootstrapping: true,
        isSigningIn: false,
        isSigningOut: false,
        turnstileSiteKey: null,
        loginMethod: null,
        signInErrorKey: null,
        isLoginDialogOpen: false,
        isAccountSwitcherOpen: false,
    })
    // Anonymous bootstrap is the default backdrop; individual tests override.
    on(TOKEN, {
        data: {
            data: {
                access_token: 'at-anon',
                refresh_token: 'rt-anon',
                expires_in: 3600,
                user: { id: 'anon-1' },
            },
        },
    })
    on(ME, { data: { data: { id: 'anon-1' } } })
})

describe('bootstrap', () => {
    it('mints an anonymous session when the device has none', async () => {
        renderAuth()
        await settled()

        expect(callsTo(TOKEN)).toHaveLength(1)
        expect(auth.isAnonymous).toBe(true)
        expect(auth.isAuthenticated).toBe(false)
    })

    it('a /me body that omits `anonymous` does not promote a guest', async () => {
        // The bug: /me answers with a profile, profiles have no reason to mention
        // `anonymous`, and replacing the stored user wholesale erased the flag —
        // turning every visitor into `isAuthenticated`, which let guarded actions
        // through and bounced them off /login so signing in became unreachable.
        on(ME, { data: { data: { id: 'anon-1', display_name: 'Guest 123' } } })

        renderAuth()
        await settled()

        expect(auth.isAuthenticated).toBe(false)
        expect(auth.isAnonymous).toBe(true)
        expect(getAccount('anon-1')?.user?.anonymous).toBe(true)
        expect(auth.currentUser?.display_name).toBe('Guest 123')
    })

    it('keeps a valid session when /me fails for a reason that is not auth', async () => {
        storedAccount('u1')
        on(ME, { status: 503, headers: { 'retry-after': '0' } })

        renderAuth()
        await settled()

        // A 500/offline must not be read as "signed out": the account is untouched,
        // so re-minting anonymously would throw away a working login.
        expect(getActiveAccountId()).toBe('u1')
        expect(callsTo(TOKEN)).toHaveLength(0)
    })

    it('falls back to anonymous only once the dead account is actually gone', async () => {
        storedAccount('u1')
        on(ME, { status: 401 })
        on('/token/refresh/', { status: 401 })

        renderAuth()
        await settled()

        await waitFor(() => expect(getAccounts().map(a => a.id)).toEqual(['anon-1']), WAIT)
        expect(callsTo(TOKEN).length).toBeGreaterThan(0)
    })
})

describe('Turnstile park and replay', () => {
    it('parks the attempt on a 406 instead of reporting a sign-in', async () => {
        renderAuth()
        await settled()
        on(LOGIN, { status: 406 })
        on(TURNSTILE, { data: { data: { site_key: 'sk-1', challenge_id: 'ch-1' } } })

        let result: string | undefined
        await act(async () => {
            result = await auth.signInWithEmail({ email: 'a@b.c', password: 'p' })
        })

        expect(result).toBe('challenge')
        expect(auth.turnstileSiteKey).toBe('sk-1')
        // Nobody is signed in — a form that treated this as success would dismiss
        // itself over a user who never got a session.
        expect(auth.isAuthenticated).toBe(false)
    })

    it('replays with the solved token, and reports the failure if the replay fails', async () => {
        renderAuth()
        await settled()
        on(LOGIN, { status: 406 })
        on(TURNSTILE, { data: { data: { site_key: 'sk-1', challenge_id: 'ch-1' } } })
        await act(async () => {
            await auth.signInWithEmail({ email: 'a@b.c', password: 'wrong' })
        })

        // The widget hands back a token; the provider is the only thing still
        // listening, since the caller's promise resolved with 'challenge' long ago.
        on(LOGIN, { status: 401 })
        await act(async () => {
            eventBus.emit('auth:turnstile-passed')
        })

        await waitFor(() => expect(auth.signInErrorKey).toBe('auth_invalid_credentials'), WAIT)
        // …and the spent widget is taken down rather than left with nothing to replay.
        expect(auth.turnstileSiteKey).toBeNull()
    })

    it('sends the single-use token on the sign-in and on nothing else', async () => {
        renderAuth()
        await settled()
        on(LOGIN, { status: 406 })
        on(TURNSTILE, { data: { data: { site_key: 'sk-1', challenge_id: 'ch-1' } } })
        await act(async () => {
            await auth.signInWithEmail({ email: 'a@b.c', password: 'p' })
        })

        on(LOGIN, {
            data: {
                data: {
                    access_token: 'at-u1',
                    refresh_token: 'rt-u1',
                    expires_in: 3600,
                    user: { id: 'u1' },
                },
            },
        })
        on(ME, { data: { data: { id: 'u1' } } })
        calls = []
        await act(async () => {
            eventBus.emit('auth:turnstile-passed')
        })

        await waitFor(() => expect(callsTo(LOGIN).length).toBeGreaterThan(0), WAIT)
        expect(callsTo(LOGIN)[0].headers.get('X-Turnstile-Challenge')).toBe('ch-1')
        // The /me that follows must not carry it: the token is single-use, and a
        // request that spends it makes the sign-in it belonged to unverifiable.
        expect(callsTo(ME)[0]?.headers.get('X-Turnstile-Challenge')).toBeFalsy()
        // Redeemed and forgotten.
        expect(getTurnstileHeaders()).toEqual({})
    })
})

describe('sign-out', () => {
    it('revokes the account it names, then forgets it locally', async () => {
        storedAccount('u1', { id: 'u1' })
        on(ME, { data: { data: { id: 'u1' } } })
        renderAuth()
        await settled()

        await act(async () => {
            await auth.signOut()
        })

        const logout = callsTo(LOGOUT)[0]
        expect(logout).toBeDefined()
        // Named, not "whoever is active" — that is what lets the client renew an
        // expired token before revoking, instead of 401ing and leaving the session up.
        expect(logout.accountId).toBe('u1')
        expect(getAccount('u1')).toBeNull()
    })

    it('does not tell the user their session expired when they asked to leave', async () => {
        storedAccount('u1', { id: 'u1' })
        on(ME, { data: { data: { id: 'u1' } } })
        renderAuth()
        await settled()

        // Token stale, refresh refused: revoking goes through the dead-account path.
        on(LOGOUT, { status: 401 })
        on('/token/refresh/', { status: 401 })
        await act(async () => {
            await auth.signOut()
        })

        expect(toastError).not.toHaveBeenCalled()
        await waitFor(() => expect(auth.isAuthenticated).toBe(false), WAIT)
    })
})

describe('the rendered profile follows the active account', () => {
    it('re-keys and refetches on a switch, with nothing to resynchronise by hand', async () => {
        storedAccount('a', { id: 'a', display_name: 'Ada' })
        storedAccount('b', { id: 'b', display_name: 'Bo' })
        setActiveAccount('a')
        on(ME, { data: { data: { id: 'a', display_name: 'Ada' } } })
        renderAuth()
        await settled()
        await waitFor(() => expect(auth.currentUser?.display_name).toBe('Ada'), WAIT)

        on(ME, { data: { data: { id: 'b', display_name: 'Bo' } } })
        await act(async () => {
            await auth.switchAccount('b')
        })

        // `currentUser` is the query cache keyed on the active account, so this
        // follows from the key changing — there is no second store to keep in step.
        await waitFor(() => expect(auth.currentUser?.display_name).toBe('Bo'), WAIT)
        expect(auth.activeId).toBe('b')
    })

    it('drops what the previous account cached — only /me is keyed by account', async () => {
        storedAccount('a', { id: 'a' })
        storedAccount('b', { id: 'b' })
        setActiveAccount('a')
        on(ME, { data: { data: { id: 'a' } } })
        renderAuth()
        await settled()
        await waitFor(() => expect(auth.currentUser?.id).toBe('a'), WAIT)

        // Anything a feature caches. `authKeys.me` carries the account id; nothing
        // else does, so without the clear this is Ada's balance handed to Bo.
        queryClient.setQueryData(['wallet'], { balance: 42 })

        on(ME, { data: { data: { id: 'b' } } })
        await act(async () => {
            await auth.switchAccount('b')
        })

        expect(queryClient.getQueryData(['wallet'])).toBeUndefined()
        await waitFor(() => expect(auth.currentUser?.id).toBe('b'), WAIT)
    })

    it('switching to the account already active costs nothing', async () => {
        storedAccount('a', { id: 'a' })
        setActiveAccount('a')
        on(ME, { data: { data: { id: 'a' } } })
        renderAuth()
        await settled()
        await waitFor(() => expect(auth.currentUser?.id).toBe('a'), WAIT)

        queryClient.setQueryData(['wallet'], { balance: 42 })
        const before = callsTo(ME).length
        await act(async () => {
            await auth.switchAccount('a')
        })

        // No wipe and no refetch: the caller ends where it started.
        expect(queryClient.getQueryData(['wallet'])).toEqual({ balance: 42 })
        expect(callsTo(ME)).toHaveLength(before)
    })

    it('has no profile at all once the last account is gone', async () => {
        renderAuth()
        await settled()
        await waitFor(() => expect(auth.currentUser).not.toBeNull(), WAIT)

        // Signing out of the only account leaves no active id, which disables the
        // query — the signed-out state needs no explicit clearing.
        clearTokens()
        await waitFor(() => expect(auth.currentUser).toBeNull(), WAIT)
        expect(auth.isAuthenticated).toBe(false)
    })
})

describe('sign-out reports itself as in flight', () => {
    it('flags isSigningOut so callers need no loading state of their own', async () => {
        storedAccount('u1', { id: 'u1' })
        on(ME, { data: { data: { id: 'u1' } } })
        renderAuth()
        await settled()

        let inFlight: boolean | undefined
        await act(async () => {
            const done = auth.signOut()
            inFlight = useAuthStore.getState().isSigningOut
            await done
        })

        expect(inFlight).toBe(true)
        expect(auth.isSigningOut).toBe(false)
    })
})

describe('a session dying underneath the user', () => {
    it('says so for a real account, and stays quiet for an anonymous one', async () => {
        renderAuth()
        await settled()

        await act(async () => {
            eventBus.emit('auth:session-expired', { wasAnonymous: true })
        })
        expect(toastError).not.toHaveBeenCalled()

        await act(async () => {
            eventBus.emit('auth:session-expired', { wasAnonymous: false })
        })
        expect(toastError).toHaveBeenCalledWith('auth_session_expired')
    })
})

describe('the account limit', () => {
    it('hands the token back and reports the limit, without stranding the form', async () => {
        for (let i = 0; i < 10; i++) storedAccount(`u${i}`)
        on(ME, { data: { data: { id: 'u9' } } })
        renderAuth()
        await settled()

        calls = []
        on(LOGIN, {
            data: {
                data: {
                    access_token: 'at-11',
                    refresh_token: 'rt-11',
                    expires_in: 3600,
                    user: { id: 'eleventh' },
                },
            },
        })
        await act(async () => {
            await auth.signInWithEmail({ email: 'a@b.c', password: 'p' }).catch(() => {})
        })

        expect(auth.signInErrorKey).toBe('auth_account_limit')
        expect(getAccount('eleventh')).toBeNull()
        // The backend minted a session nothing here will keep — give it straight back
        // rather than leaving a live token nobody can reach.
        const revoke = callsTo(LOGOUT)[0]
        expect(revoke?.headers.get('Authorization')).toBe('Bearer at-11')
        expect(auth.turnstileSiteKey).toBeNull()
    })
})

/**
 * `LoginDialog` closes on this event and on nothing else, so what does and does not emit
 * it is a contract rather than an implementation detail. It was an `onSuccess` prop before,
 * threaded only as far as the email form — so seven of the eight ways in left the dialog
 * open over an app that had already logged in.
 */
describe('auth:signed-in tells the app a real session now exists', () => {
    const listen = () => {
        const seen: Array<{ userId: string }> = []
        const on_ = (e: { userId: string }) => seen.push(e)
        eventBus.on('auth:signed-in', on_)
        return { seen, stop: () => eventBus.off('auth:signed-in', on_) }
    }

    it('fires for a provider sign-in, not only for email', async () => {
        renderAuth()
        await settled()
        on(CONNECT_APPLE, {
            data: {
                data: {
                    access_token: 'at-u1',
                    refresh_token: 'rt-u1',
                    expires_in: 3600,
                    user: { id: 'u1' },
                },
            },
        })
        on(ME, { data: { data: { id: 'u1' } } })

        const { seen, stop } = listen()
        await act(async () => {
            await auth.signInWithProvider('apple', { access_token: 'code' })
        })
        stop()

        expect(seen).toEqual([{ userId: 'u1' }])
    })

    it('does not fire when the session is only the anonymous one', async () => {
        // Bootstrap mints a session too. If that emitted, the dialog would shut itself
        // the moment the page loaded, before anyone had signed in to anything.
        const { seen, stop } = listen()
        renderAuth()
        await settled()
        stop()

        expect(auth.isAnonymous).toBe(true)
        expect(seen).toEqual([])
    })

    it('does not fire when Cloudflare parks the attempt', async () => {
        renderAuth()
        await settled()
        on(LOGIN, { status: 406 })
        on(TURNSTILE, { data: { data: { site_key: 'sk-1', challenge_id: 'ch-1' } } })

        const { seen, stop } = listen()
        await act(async () => {
            await auth.signInWithEmail({ email: 'a@b.c', password: 'p' })
        })
        stop()

        // A 406 is "solve this first", and the dialog must stay open behind the widget.
        expect(seen).toEqual([])
    })
})
