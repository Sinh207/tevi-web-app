import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { type Gateway, normalizeGateways, normalizeStarPackages, type StarPackage } from './types'

/**
 * What can be bought, and what can pay for it — the two lists the Star sheet is built from.
 *
 * Both are **platform** data: the same answer for every reader, which is why neither is
 * account-scoped (see `api/keys.ts`).
 *
 * ## `payment/v3/countries/` is deliberately not here
 *
 * Legacy has it, and calls it from the add-card form to populate a country `<select>`. This client
 * does not need it: the card form is Stripe's `AddressElement`, which ships its own country list,
 * already translated. And the gateway list takes an *optional* country — legacy calls
 * `getPaymentMethods()` with no argument at all, i.e. the backend geolocates. Modelling an endpoint
 * whose payload shape nobody has confirmed, for a control that no longer exists, would be inventing
 * a DTO.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/paymee` })

/** Legacy's page size for the package list. It has never returned a second page. */
const PACKAGE_PAGE_SIZE = 20

export const catalogApi = {
    /**
     * Ways to pay. `country` is optional — omitted, the backend decides from the request, which is
     * what legacy relies on.
     *
     * An empty list is a legitimate answer (a country with no enabled gateway) and is **not** an
     * error: the sheet then says Star cannot be bought here, which is true, rather than showing a
     * spinner or a retry button for a request that succeeded.
     */
    async getGateways(country?: string | null, signal?: AbortSignal): Promise<Gateway[]> {
        const body = await api.get<unknown>(
            'payment/v3/payment-methods/',
            country ? { country } : undefined,
            // The gateways enabled for a *country*, not this account's saved cards
            // (`my-payment-methods/`) — public, and edited by the backoffice.
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        return normalizeGateways(body)
    },

    /**
     * Star packages.
     *
     * `pageSize` is camelCase **on the wire** — that is legacy's spelling for this endpoint and the
     * only one it has been seen to accept, unlike every other paginated list on billy which uses
     * `page_size`. Left as-is rather than "fixed": a silently ignored parameter would page at the
     * server's default and nobody would notice until a tenth package shipped.
     */
    async getStarPackages(signal?: AbortSignal): Promise<StarPackage[]> {
        const body = await api.get<unknown>(
            'stars/v3/conversion-packages/',
            { page: 1, pageSize: PACKAGE_PAGE_SIZE },
            { signal, cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day } },
        )
        return normalizeStarPackages(body)
    },
}
