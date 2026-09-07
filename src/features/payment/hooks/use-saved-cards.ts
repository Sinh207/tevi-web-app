'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { paymentKeys } from '../api/keys'
import { MAX_SAVED_CARDS, paymentMethodsApi } from '../api/payment-methods-api'
import { pickDefaultCard, type SavedCard } from '../api/types'

/**
 * The saved-card screen's whole state: the list, "make this the default", and "forget this card".
 *
 * ## Nothing here is optimistic, and that is the decision worth the words
 *
 * Every other list in this app patches its cache first and rolls back on failure — a settings toggle
 * that waits for a round trip reads as broken. This one does not, for two reasons that only apply to
 * money. A card row that vanishes and then reappears because the `DELETE` failed is a reader who has
 * just been told, twice, contradictory things about what their account can be charged with. And the
 * *default* card is what a checkout will silently charge: an optimistic badge that turns out to be
 * wrong means the next payment leaves a different card than the screen said it would.
 *
 * So both mutations wait for the server, and `pendingId` is what the row spins on. Both requests are
 * fast (a `DELETE` and a `POST` with no body), so the cost of honesty here is ~200ms.
 *
 * ## The account is pinned at press time, not read when the response lands
 *
 * `activeId` is captured into the mutation *variables* — the account that was active when the row was
 * pressed. Reading it from the closure inside `onSuccess` would take whatever is active when the
 * response arrives: `useMutation` re-registers its options every render, so the callbacks that run
 * are the latest ones, and an account switch mid-flight would invalidate account B's card list
 * because account A deleted a card. The request itself is pinned the same way (`paymentMethodsApi`
 * threads `accountId` into the axios config, which is also what scopes its ETag entry).
 *
 * Same rule, same reason, as `useUpdateMe` — and it matters more here, because the mistake is not a
 * stale display name but a delete attributed to the wrong account.
 *
 * ## This hook never refuses a delete; the screen does, and it says why
 *
 * Legacy has the rule in **two** places and only one of them works: `cardManagement/hook:deleteCard`
 * opens with `if (allCards.length <= 1) return`, which is a menu item that does nothing and says
 * nothing (`docs/PAYMENT.md` §1.4 #7) — while its *UI* opens a "This Card Can't Be Removed" notice for
 * the same condition. `card-management-view.tsx` keeps the notice and drops the silent return, so the
 * refusal is something the reader is told rather than something they infer from a dead control.
 *
 * Keeping it out of here is deliberate: a hook that quietly swallows a call cannot be told apart from
 * a broken one, and if the **backend** has its own rule it will answer with it, which is what the
 * error toast is for.
 *
 * ## The cap is published, not enforced by silence
 *
 * `isFull` is what disables the "Add card" affordance, and it is `>=`, not `>`: legacy's
 * `allCards?.length > 10` lets an eleventh card through (§1.4 #8). Whether the backend enforces the
 * number at all is **B67** — so this is a courtesy that stops a doomed dialog from opening, never a
 * substitute for the server's answer.
 */

export interface UseSavedCardsResult {
    cards: SavedCard[]
    /**
     * The account's default method — the flagged one, else the first.
     *
     * ⚠ **Not "the card a checkout starts on".** It used to say that, and it was wrong in one case that
     * matters: an expired card can be the default, and starting a checkout on it is a guaranteed
     * decline. `pickPayableCard` (`lib/card-brand.ts`) is what a payment surface asks; this is what a
     * *management* surface shows, where the expired default is exactly the row the reader came to deal
     * with.
     */
    defaultCard: SavedCard | null
    isLoading: boolean
    isError: boolean
    /** The request came back and held nothing. Never true while loading or while signed out. */
    isEmpty: boolean
    /** A saved card belongs to a real account; the anonymous session every visitor carries has none. */
    isSignedOut: boolean
    refetch: () => void
    /** The cap is reached, so the add affordance must not offer to open. */
    isFull: boolean
    /** How many more cards this account may save. `0` when `isFull`. */
    remaining: number
    /** The row with a write in flight, so it can spin and the others can stand down. */
    pendingId: string | null
    /** *Some* row's write is in flight. The screen is single-flight — see `setDefault`. */
    isMutating: boolean
    setDefault: (card: SavedCard) => void
    remove: (card: SavedCard) => void
}

export function useSavedCards({ enabled = true }: { enabled?: boolean } = {}): UseSavedCardsResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /**
     * Memoised because `paymentKeys.cards` builds a **new array** every call, and the callbacks below
     * are `useCallback`ed against it. Derived from a primitive, so it changes only when the account
     * does — which is exactly when every consumer *should* see a new identity.
     */
    const queryKey = useMemo(() => paymentKeys.cards(activeId), [activeId])

    const query = useQuery({
        queryKey,
        queryFn: ({ signal }) => paymentMethodsApi.list({ accountId: activeId, signal }),
        /*
         * Two gates, and the second one is not a micro-optimisation.
         *
         * Anonymous sessions have no saved cards, and asking would be a 401 per visitor — the screen
         * shows the sign-in prompt instead, gating the **action** rather than the route.
         *
         * `enabled` is for a caller that is mounted whether or not anyone is paying. `PaymentProvider`
         * is one: it sits above every route so a checkout can outlive the surface that started it, and
         * with an ungated query that meant **every page load fetched the card list** for every signed-in
         * reader — a request nobody asked for, on screens that have nothing to do with paying. A
         * screen *about* cards (`/card-management`) leaves it at the default.
         */
        enabled: isAuthenticated && enabled,
    })

    const cards = query.data ?? []

    const setDefaultMutation = useMutation({
        mutationFn: ({ id, accountId }: { id: string; accountId: string | null }) =>
            paymentMethodsApi.setDefault(id, { accountId }),
        onSuccess: (_data, { accountId }) => {
            /*
             * Invalidate, never write the flag into the cache by hand: `default` is exclusive across
             * the whole list, so a local patch would have to un-flag the previous default too, and
             * the payload is the only thing that knows which row that was. The key is the one the
             * press was filed under — see the note above about pinning.
             */
            void queryClient.invalidateQueries({ queryKey: paymentKeys.cards(accountId) })
            toast.success(t('payment_card_default_set'))
        },
        meta: { showErrorToast: t('payment_card_default_failed') },
    })

    const removeMutation = useMutation({
        mutationFn: ({
            id,
            accountId,
        }: {
            id: string
            accountId: string | null
            wasDefault: boolean
            nextId: string | null
        }) => paymentMethodsApi.remove(id, { accountId }),
        onSuccess: async (_data, { accountId, wasDefault, nextId }) => {
            /*
             * Deleting the default and leaving cards behind promotes the first survivor — legacy's own
             * behaviour, kept because the alternative is an account with saved cards and no default,
             * and a checkout that then has nothing pre-selected.
             *
             * **Who owns this promotion is genuinely unknown (B66).** So it is written to be harmless
             * if the backend already did it: `set-as-default/` on the row that is already default is a
             * no-op, and the invalidate below refetches the truth either way. `nextId` is computed at
             * press time from the list the reader was looking at — the only list this client has — and
             * a failure here is swallowed rather than toasted, because the delete the reader asked for
             * did succeed.
             */
            if (wasDefault && nextId) {
                try {
                    await paymentMethodsApi.setDefault(nextId, { accountId })
                } catch {
                    // Reported by the refetch below: the list will simply show no default.
                }
            }
            void queryClient.invalidateQueries({ queryKey: paymentKeys.cards(accountId) })
            toast.success(t('payment_card_deleted'))
        },
        meta: { showErrorToast: t('payment_card_delete_failed') },
    })

    /**
     * **One write at a time, for the whole screen.**
     *
     * Not a limitation of `useMutation` so much as of what a *single* mutation can report:
     * `isPending` and `variables` describe the most recent run, so two overlapping writes would leave
     * `pendingId` pointing at one of them and the other row spinning forever. The consequence is what
     * has to be handled rather than the rule — the view disables the other rows' menus, because a
     * control that cannot act must not look like one.
     */
    const isMutating = setDefaultMutation.isPending || removeMutation.isPending

    const setDefault = useCallback(
        (card: SavedCard) => {
            // Guarded here as well as in the view: `disabled` is a rendered attribute, and a second
            // press can land in the same frame as the first, before it exists.
            if (isMutating || card.default) return
            setDefaultMutation.mutate({ id: card.id, accountId: activeId })
        },
        [activeId, isMutating, setDefaultMutation],
    )

    const remove = useCallback(
        (card: SavedCard) => {
            if (isMutating) return
            const survivors = cards.filter(row => row.id !== card.id)
            removeMutation.mutate({
                id: card.id,
                accountId: activeId,
                wasDefault: Boolean(card.default),
                nextId: survivors[0]?.id ?? null,
            })
        },
        [activeId, cards, isMutating, removeMutation],
    )

    const pendingId = setDefaultMutation.isPending
        ? (setDefaultMutation.variables?.id ?? null)
        : removeMutation.isPending
          ? (removeMutation.variables?.id ?? null)
          : null

    return {
        cards,
        defaultCard: pickDefaultCard(cards),
        isLoading: isAuthenticated && enabled && query.isLoading,
        isError: query.isError,
        isEmpty: isAuthenticated && !query.isLoading && !query.isError && cards.length === 0,
        isSignedOut: !isAuthenticated,
        refetch: query.refetch,
        isFull: cards.length >= MAX_SAVED_CARDS,
        remaining: Math.max(0, MAX_SAVED_CARDS - cards.length),
        pendingId,
        isMutating,
        setDefault,
        remove,
    }
}
