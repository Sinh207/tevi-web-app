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
    if (error instanceof ApiError && (error.isAuthError() || error.isNetwork)) return
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
                retry: (failureCount, error) => {
                    // Never retry 4xx; the axios layer already retried 5xx/network.
                    if (error instanceof ApiError && error.status && error.status < 500)
                        return false
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
