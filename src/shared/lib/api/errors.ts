import type { AxiosError } from 'axios'

/** Normalized API error surfaced to the app. */
export class ApiError extends Error {
    readonly status: number | undefined
    readonly code: string | undefined
    readonly isNetwork: boolean
    /** The caller aborted (unmount, refetch) — not a failure worth reporting. */
    readonly isCanceled: boolean
    readonly data: unknown

    constructor(params: {
        message: string
        status?: number
        code?: string
        isNetwork?: boolean
        isCanceled?: boolean
        data?: unknown
    }) {
        super(params.message)
        this.name = 'ApiError'
        this.status = params.status
        this.code = params.code
        this.isNetwork = params.isNetwork ?? false
        this.isCanceled = params.isCanceled ?? false
        this.data = params.data
    }

    isAuthError() {
        return this.status === 401
    }
    isForbidden() {
        return this.status === 403
    }
    isNotFound() {
        return this.status === 404
    }
    isRateLimited() {
        return this.status === 429
    }
    isServerError() {
        return this.status !== undefined && this.status >= 500
    }
}

/** The backend wraps responses in `{ success, code, data, message }`. */
interface ApiErrorBody {
    code?: string | number
    error?: string
    message?: string
}

/** Convert any thrown value / AxiosError into a stable ApiError. */
export function normalizeApiError(error: unknown): ApiError {
    if (error instanceof ApiError) return error

    const axiosErr = error as AxiosError<ApiErrorBody>
    if (axiosErr?.isAxiosError) {
        const status = axiosErr.response?.status
        const body = axiosErr.response?.data
        const isCanceled = axiosErr.code === 'ERR_CANCELED'
        // A timeout has no response either, but it is a network failure, not a
        // deliberate abort — only the latter should be treated as "nothing happened".
        const isNetwork = !axiosErr.response && !isCanceled
        return new ApiError({
            message:
                body?.message ||
                body?.error ||
                axiosErr.message ||
                (isNetwork ? 'Unable to reach server' : 'Request failed'),
            status,
            code: body?.code != null ? String(body.code) : axiosErr.code,
            isNetwork,
            isCanceled,
            data: body,
        })
    }
    if (error instanceof Error) return new ApiError({ message: error.message })
    return new ApiError({ message: 'Unknown error' })
}
