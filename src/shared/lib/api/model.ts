import { env } from '@shared/config/env'
import type { AxiosRequestConfig } from 'axios'
import { apiClient } from './client'

/** Strip empty/null/undefined params (ported from legacy `filterParams`). */
function filterParams<T extends Record<string, unknown> | undefined>(params: T): T {
    if (!params) return params
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(params)) {
        if (v !== '' && v !== null && v !== undefined) out[k] = v
    }
    return out as T
}

/**
 * Build a thin model bound to a service base URL (e.g. `/core`, `/auth`).
 * Methods return the parsed response body. Two-file model pattern:
 *   apiAuth = createApiModel({ apiBase: `${W_API}/auth` })
 *   auth.login = () => apiAuth.post('v1/user-login/login/', body)
 */
export function createApiModel({
    apiBase,
    apiPrefix = '/',
}: {
    apiBase: string
    apiPrefix?: string
}) {
    const base = apiBase.startsWith('http') ? apiBase : `${env.NEXT_PUBLIC_W_API_DOMAIN}${apiBase}`
    const join = (path: string) => {
        const p = path.startsWith('/') ? path.slice(1) : path
        const prefix = apiPrefix.endsWith('/') ? apiPrefix : `${apiPrefix}/`
        return `${base}${prefix}${p}`
    }

    return {
        apiBase: base,
        get: <T = unknown>(
            path: string,
            params?: Record<string, unknown>,
            config?: AxiosRequestConfig,
        ) =>
            apiClient
                .get<T>(join(path), { ...config, params: filterParams(params) })
                .then(r => r.data as T),
        post: <T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
            apiClient.post<T>(join(path), body, config).then(r => r.data as T),
        put: <T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
            apiClient.put<T>(join(path), body, config).then(r => r.data as T),
        patch: <T = unknown>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
            apiClient.patch<T>(join(path), body, config).then(r => r.data as T),
        del: <T = unknown>(path: string, config?: AxiosRequestConfig) =>
            apiClient.delete<T>(join(path), config).then(r => r.data as T),
    }
}

export type ApiModel = ReturnType<typeof createApiModel>
