import { type DefaultError, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from './errors'

/**
 * Opt-in error toasts via `meta.showErrorToast`:
 *   useQuery({ ..., meta: { showErrorToast: true } })
 *   useMutation({ ..., meta: { showErrorToast: 'Could not save' } })
 * Network errors are already toasted elsewhere; 401 is handled by the interceptor.
 */
declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: { showErrorToast?: boolean | string }
        mutationMeta: { showErrorToast?: boolean | string }
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
