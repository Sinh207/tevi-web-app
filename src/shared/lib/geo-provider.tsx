'use client'

import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo } from 'react'
import { normalizeCountryCode } from './geo'

/**
 * The visitor's country, resolved **once when the site opens** and read by whoever needs it.
 *
 * ## Two ways in, and the first one costs nothing
 *
 * 1. **The document render.** `(web)/layout.tsx` reads the edge's country header
 *    (`shared/lib/geo.ts`) and passes it in as a prop, exactly as the locale arrives. So on a normal
 *    visit the country is already known during the first paint: no request, no waiting, no effect.
 * 2. **A single fallback request.** When that came back empty the provider asks
 *    `GET /api/client-ip` once — the same headers, read again, which is legacy's own
 *    `fetch('/api/country')` at app open. It is `enabled` only in that case, so the common path
 *    stays request-free.
 *
 * ## It never fails, and it never guesses
 *
 * `fetchCountry` resolves to `null` for every failure — a 4xx, a 5xx, an HTML error page from a proxy
 * that never reached the app, a body that is not JSON, a timeout, an offline browser. None of those
 * throws, so nothing retries in a loop and no screen has to render an error for a *prefill*.
 *
 * And `null` stays `null`: legacy defaults to `'US'` on any failure, which silently prefills a
 * Vietnamese creator's payout form with the United States — a wrong country offers the wrong payout
 * methods, and nothing on the screen says where it came from. A screen that has no country **asks**
 * (`useSetupPayouts`).
 *
 * ## Why a provider rather than a bare query
 *
 * The SSR value has to reach the client somehow, and a prop through one context is the same shape
 * `LocaleProvider` already uses for the locale. `useWebConfig` gets away with no provider because it
 * has nothing to seed; this does.
 */

/** The context's value. `null` means *unknown*, which is a real answer here. */
interface CountryState {
    country: string | null
    /** `false` only while the fallback request is in flight — a prefill may wait for it. */
    isKnown: boolean
}

const CountryContext = createContext<CountryState>({ country: null, isKnown: true })

/** How long the answer is good for: a visitor does not change country mid-session. */
const COUNTRY_STALE_TIME = Number.POSITIVE_INFINITY

/** Long enough for a proxy hop, short enough that a prefill is not waiting on a dead endpoint. */
const COUNTRY_TIMEOUT_MS = 5000

export const countryKeys = {
    /**
     * Not keyed on the account: the country is the *connection's*, not the reader's, so switching
     * accounts must not refetch it — and two accounts on one device cannot disagree about it.
     */
    country: ['geo', 'country'] as const,
}

/**
 * Ask the app's own endpoint. Resolves `null` for **every** failure; never rejects.
 *
 * The status check is the one that matters in practice: a misconfigured ingress answers `502` with an
 * HTML body, and `res.json()` on that throws a `SyntaxError` — which, without this, surfaces as an
 * unhandled rejection in a query that then retries it twice.
 */
export async function fetchCountry(): Promise<string | null> {
    try {
        const response = await fetch('/api/client-ip', {
            // No credentials and no cache: the answer is per-connection and carries no account.
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(COUNTRY_TIMEOUT_MS),
        })
        // 4xx and 5xx both land here — including the 404 a deploy that dropped the route would give.
        if (!response.ok) return null
        const body: unknown = await response.json()
        return normalizeCountryCode((body as { country?: unknown } | null)?.country)
    } catch {
        // Timeout, offline, DNS, a body that is not JSON. A prefill is not worth a thrown render.
        return null
    }
}

export function CountryProvider({
    country,
    children,
}: {
    /**
     * The country the edge reported for **this** request, read during the document render. `null` or
     * `undefined` when no proxy said — the fallback request then runs once.
     */
    country?: string | null
    children: React.ReactNode
}) {
    const fromServer = normalizeCountryCode(country)

    const query = useQuery({
        queryKey: countryKeys.country,
        queryFn: fetchCountry,
        // Only when the document render came back empty. Nothing to ask otherwise.
        enabled: !fromServer,
        staleTime: COUNTRY_STALE_TIME,
        /*
         * No retry: `fetchCountry` already answers `null` instead of failing, so a retry could only
         * repeat a request that *succeeded* at telling us nothing.
         */
        retry: false,
        refetchOnWindowFocus: false,
    })

    const value = useMemo<CountryState>(
        () => ({
            country: fromServer ?? query.data ?? null,
            // Known immediately when the server answered; otherwise once the one request settles.
            isKnown: Boolean(fromServer) || !query.isLoading,
        }),
        [fromServer, query.data, query.isLoading],
    )

    return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>
}

/**
 * The visitor's country as an ISO alpha-2 code, or `null` when nobody could say.
 *
 * **A hint, for prefilling a control.** `shared/lib/geo.ts` states why it can never be more than
 * that: every header behind it is spoofable, so nothing may be granted, priced or withheld on it.
 */
export function useCountry(): CountryState {
    return useContext(CountryContext)
}
