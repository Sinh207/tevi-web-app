import { type DefaultError, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from './errors'

/**
 * Opt-in error toasts via `meta.showErrorToast`:
 *   useQuery({ ..., meta: { showErrorToast: true } })
 *   useMutation({ ..., meta: { showErrorToast: 'Could not save' } })
 * Network errors are already toasted elsewhere; 401 is handled by the interceptor.
 *
 * **A mutation's value is a `string`, never `true`** — and that asymmetry is the point.
 * `true` means "print `error.message`", and on a failed **write** that is the one thing
 * that must not be printed: `normalizeApiError` falls back to axios's own English
 * (*"Request failed with status code 400"*) whenever the body carried no message, so
 * `true` would put a library's internal wording on a money screen in nine locales.
 *
 * A write's string is therefore its **fallback**, used when the API's own 4xx message is
 * absent or unusable — the API's sentence is what a reader should see first, because the
 * backend is the only party that knows why *that* write was refused. Typing the boolean out
 * of `mutationMeta` makes "every write carries a translated fallback" a compile error
 * instead of a convention. Queries keep the boolean: nothing prints `error.message` there.
 *
 * The full rule, the statuses that are skipped (5xx, 429, 403) and the shared predicate:
 * `docs/API_ERRORS.md`.
 */
declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: { showErrorToast?: boolean | string }
        mutationMeta: { showErrorToast?: string }
    }
}

function toastError(error: DefaultError, meta?: { showErrorToast?: boolean | string }) {
    if (!meta?.showErrorToast) return
    // 401 is the interceptor's business, network errors are toasted elsewhere, and a
    // cancelled request is the app's own doing — none of them are news to the user.
    if (error instanceof ApiError && (error.isAuthError() || error.isNetwork || error.isCanceled)) {
        return
    }
    const msg = typeof meta.showErrorToast === 'string' ? meta.showErrorToast : error.message
    toast.error(msg)
}

/**
 * `staleTime` and `gcTime` together, because on their own the first one is a claim the second
 * quietly overrules.
 *
 * `staleTime` says how long data may be *served* without refetching; `gcTime` says how long an
 * **inactive** query's data is kept at all. The defaults are 60s and 5min, so a hook that sets a
 * 24-hour `staleTime` and nothing else is not caching for 24 hours — it caches until five minutes
 * after the last component reading it unmounts, and the next visit refetches in full. Every long
 * `staleTime` in this app was written that way, which is why a country list declared stale-after-a-
 * day was still re-requested by anyone who left the screen and came back after lunch.
 *
 * Pass the number once and get both. The value stays each call site's own decision — this only
 * stops the two from disagreeing.
 */
export function keepFor(ms: number) {
    return { staleTime: ms, gcTime: ms } as const
}

export function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                gcTime: 5 * 60_000,
                refetchOnWindowFocus: false,
                /**
                 * **The axios layer is the only thing that retries a request.**
                 *
                 * It already makes up to three attempts on 5xx / 429 / network
                 * (`client.ts`), and everything it rejects with is an `ApiError`. Retrying
                 * those again here multiplied rather than added: three axios attempts
                 * inside three query attempts is **nine requests** for one failing
                 * endpoint, which is how a struggling backend gets finished off by its own
                 * clients.
                 *
                 * So an `ApiError` is final — the retrying already happened. Anything else
                 * reaching this point is a bug in a queryFn rather than a transport
                 * failure, and it keeps a small budget in case it is transient.
                 */
                retry: (failureCount, error) => {
                    if (error instanceof ApiError) return false
                    return failureCount < 2
                },
                retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30_000),
            },
            mutations: { retry: false },
        },
        queryCache: new QueryCache({
            onError: (error, query) => toastError(error, query.meta),
        }),
        mutationCache: new MutationCache({
            onError: (error, _vars, _ctx, mutation) => toastError(error, mutation.meta),
        }),
    })
}
