import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import {
    normalizeSavedCards,
    normalizeSetupIntent,
    type SavedCard,
    type SetupIntent,
} from './types'

/**
 * The account's saved cards — `paymee/payment/v3/my-payment-methods/`.
 *
 * Four operations, and the interesting one is `createSetupIntent`: adding a card is not a `POST` of
 * card details (this app never sees them), it is asking Stripe — through our backend — for a
 * SetupIntent that the browser then confirms inside Stripe's own iframe.
 *
 * Every method threads `accountId`: the account that was active when the row was pressed, not the one
 * active when the request goes out. On a screen where two accounts can be switched between while a
 * delete is in flight, that is the difference between deleting the right card and deleting somebody
 * else's.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/paymee` })

const BASE = 'payment/v3/my-payment-methods/'

/**
 * The cap, and **the backend does not enforce one** (B67, answered) — so this is not a mirror of a
 * server rule, it *is* the rule.
 *
 * Two things follow. There is no error code to print, so the affordance must be disabled with a reason
 * rather than allowed to become a failed request (`isFull` in `use-saved-cards.ts`,
 * `payment_card_limit_reached`). And `isFull` compares `>=`, not legacy's `> 10` — that off-by-one is
 * how an account can already hold eleven cards, and a list longer than its own limit must disable Add
 * rather than break the screen.
 *
 * Kept as a constant so the affordance and the copy agree. A cap nobody enforces is one this client can
 * drift on; if the backend ever grows one, it needs an error code and B67 reopens.
 */
export const MAX_SAVED_CARDS = 10

interface Scope {
    accountId?: string | null
    signal?: AbortSignal
}

function config({ accountId, signal }: Scope) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

export const paymentMethodsApi = {
    /**
     * The saved methods, server order preserved. `pickDefaultCard` picks the one a *management* screen
     * highlights; a *checkout* asks `pickPayableCard`, which skips an expired default.
     */
    async list(scope: Scope = {}): Promise<SavedCard[]> {
        const body = await api.get<unknown>(BASE, undefined, config(scope))
        return normalizeSavedCards(body)
    },

    /**
     * Ask for a SetupIntent to attach a new card to this account.
     *
     * ⚠ **Not retried**, and it is a `POST` so `apiClient` would not replay it anyway. A retry here
     * is not dangerous the way a charge is — an unused SetupIntent expires — but each one is a Stripe
     * object created in our account, and a network blip should not mint three of them.
     *
     * `null` when the response carried no client secret; the dialog then shows an error rather than
     * an empty card form.
     */
    async createSetupIntent(scope: Scope = {}): Promise<SetupIntent | null> {
        const body = await api.post<unknown>(BASE, undefined, config(scope))
        return normalizeSetupIntent(body)
    },

    /**
     * Forget a card.
     *
     * The response is **`204`** (B66, answered), so there is no body — and legacy's other call site
     * checks `res?.status === 200` for this same endpoint, which reports a successful delete as an
     * error. Anything non-2xx rejects at the client, so reaching the next line *is* the success
     * condition, and no status comparison exists here to be wrong.
     *
     * **No rule in this layer.** Legacy refuses the last card twice over: a silent
     * `if (allCards.length <= 1) return` in its hook, and a "This Card Can't Be Removed" notice in its
     * UI. The notice is kept (`card-management-view.tsx`), the silent return is not — and neither
     * belongs here. If the backend has the rule as well it will say so, and the screen prints it.
     */
    remove(id: string, scope: Scope = {}): Promise<unknown> {
        return api.del(`${BASE}${encodeURIComponent(id)}/`, undefined, config(scope))
    },

    /** Make this the card a checkout starts on. */
    setDefault(id: string, scope: Scope = {}): Promise<unknown> {
        return api.post(
            `${BASE}${encodeURIComponent(id)}/set-as-default/`,
            undefined,
            config(scope),
        )
    },
}
