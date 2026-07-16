import type { AxiosError } from 'axios'

/** Normalized API error surfaced to the app. */
export class ApiError extends Error {
    readonly status: number | undefined
    readonly code: string | undefined
    readonly isNetwork: boolean
    readonly data: unknown

    constructor(params: {
        message: string
        status?: number
        code?: string
        isNetwork?: boolean
        data?: unknown
    }) {
        super(params.message)
        this.name = 'ApiError'
        this.status = params.status
        this.code = params.code
        this.isNetwork = params.isNetwork ?? false
        this.data = params.data
    }

    isAuthError() {
        return this.status === 401
    }
    isForbidden() {
        return this.status === 403
    }
}

/** The backend wraps responses in `{ success, code, data, message }`. */
interface ApiErrorBody {
    code?: string
    error?: string
    message?: string
}

/** Convert any thrown value / AxiosError into a stable ApiError. */
export function normalizeApiError(error: unknown): ApiError {
    const axiosErr = error as AxiosError<ApiErrorBody>
    if (axiosErr?.isAxiosError) {
        const status = axiosErr.response?.status
        const body = axiosErr.response?.data
        const isNetwork = !axiosErr.response
        return new ApiError({
            message:
                body?.message ||
                body?.error ||
                axiosErr.message ||
                (isNetwork ? 'Unable to reach server' : 'Request failed'),
            status,
            code: body?.code,
            isNetwork,
            data: body,
        })
    }
    if (error instanceof ApiError) return error
    if (error instanceof Error) return new ApiError({ message: error.message })
    return new ApiError({ message: 'Unknown error' })
}
