'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeError } from '@stripe/stripe-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { paymentKeys } from '../api/keys'
import { paymentMethodsApi } from '../api/payment-methods-api'
import { checkoutReturnUrl } from '../lib/return-url'

/**
 * Saving a card, in the two halves the browser forces it into.
 *
 * `useAddCard` mints the SetupIntent — it runs **outside** `<Elements>`, because the secret it
 * produces is what mounts `<Elements>` in the first place. `useCardSetupForm` confirms it, and can
 * only be called **inside** that scope: `useStripe()` / `useElements()` read a context
 * `StripeElementsScope` provides. Two hooks in one file rather than two files, because neither is
 * usable without the other and the account is threaded from the first into the second (below).
 *
 * ## What legacy does here, and why none of it is ported
 *
 * `paymentMethods/index.js` mounts **four** separate elements by hand — `cardNumber`, `cardExpiry`,
 * `cardCvc`, `postalCode` — through `elements.create()` + `mount('#id')` + a ref each, tracks a
 * `complete` and an `error` flag per element, and builds its own country `<select>` from
 * `CoreModel.getCountries`. All of it is replaced by one `PaymentElement` plus one `AddressElement`:
 * Stripe validates, localises and lists countries itself, and — the part hand-mounted card fields
 * cannot do — offers Link and the local wallets alongside a card.
 *
 * It also reads `error.type` straight after `confirmPayment` **without a null check**
 * (`docs/PAYMENT.md` §1.4 #4), so a successful non-redirecting confirmation is a `TypeError`. The
 * result object here is destructured with `error` checked first, always.
 */

/**
 * A `StripeError` on its way from `confirmSetup` to the form's error line.
 *
 * A class rather than a `{ ok: false }` return, because the mutation's own `isError` / `isPending`
 * are what the dialog renders — folding a failure into a successful resolution would mean
 * reimplementing both.
 */
class CardSetupError extends Error {
    constructor(readonly stripeError: StripeError) {
        super(stripeError.message ?? 'card setup failed')
        this.name = 'CardSetupError'
    }
}

/**
 * Whether Stripe's own message may be shown.
 *
 * The same narrow rule `providerSignInErrorText` states in `features/auth`, applied to a different
 * source: `card_error` and `validation_error` are the two `StripeError` types Stripe documents as
 * *written for the cardholder* and localised to the Elements locale — "Your card was declined",
 * "Your card's expiry year is in the past". No key of ours can say those, and paraphrasing a decline
 * reason is how a reader ends up retrying a card the bank will refuse again.
 *
 * Every other type (`api_error`, `api_connection_error`, `rate_limit_error`, `invalid_request_error`,
 * `idempotency_error`) is infrastructure talking to us, not to them, and gets our own key.
 */
function cardholderMessage(error: StripeError): string | null {
    if (error.type !== 'card_error' && error.type !== 'validation_error') return null
    const message = error.message?.trim()
    return message ? message : null
}

export interface UseAddCardResult {
    /** The SetupIntent secret, or `null` while there is not one. Never cached, never logged. */
    clientSecret: string | null
    /** The account the intent was minted for. Carry it into `useCardSetupForm` — see its doc. */
    accountId: string | null
    isPreparing: boolean
    /**
     * There will be no card form: the request failed, **or** it answered without a client secret.
     *
     * The second case is the one worth naming. `normalizeSetupIntent` returns `null` for a 200 that
     * carried no secret, and legacy renders an empty `<Elements>` for it — a dialog with a header and
     * blank space, and no way for the reader to tell whether to wait. A missing secret is an error
     * state, not an empty form.
     */
    isUnavailable: boolean
    /** Ask again. Clears the failure and mints a fresh intent. */
    retry: () => void
}

/**
 * Mint a SetupIntent while the dialog is open.
 *
 * ## Why this is a mutation and not a query
 *
 * It is a `POST` that creates an object in our Stripe account, so it is not idempotent and there is
 * nothing to cache — but more importantly, a query would **hold the secret in the query cache** for
 * its `gcTime` after the dialog closed. `api/types.ts` states the rule where the secret enters the
 * app: never a query key, never storage, never a log; it lives in the dialog's own state for as long
 * as the dialog is open. A mutation's `data` is exactly that scope.
 *
 * ## Minted once per (open × account)
 *
 * The ref guard is not defensive coding: React's StrictMode double-invokes effects in development, so
 * without it every dev open creates two SetupIntents. An **account switch while the dialog is open
 * does** re-mint, deliberately — an intent belongs to one Stripe customer, and confirming account A's
 * intent after switching to B would attach the card to A.
 */
export function useAddCard({ open }: { open: boolean }): UseAddCardResult {
    const { activeId } = useAuth()
    const mutation = useMutation({
        mutationFn: (accountId: string | null) =>
            paymentMethodsApi.createSetupIntent({ accountId }),
    })
    const { mutate, reset } = mutation

    /** The `(open × account)` this hook has already minted for. `null` while closed. */
    const minted = useRef<string | null>(null)
    /** The account the held secret belongs to — see `accountId` on the result. */
    const [mintedFor, setMintedFor] = useState<string | null>(null)
    /**
     * Bumped by `retry`, and the **only** reason it exists: the effect below has to re-run, and none
     * of its other dependencies can change on a retry — `open` and `activeId` are the same, and
     * `mutate`/`reset` are bound once by TanStack (`MutationObserver.bindMethods`), so they are
     * referentially stable forever.
     *
     * Without it, `retry()` cleared the guard, `reset()` put the mutation back to `idle`, and the
     * dialog swapped its error for a spinner that spun forever having sent **zero** requests — the
     * one failure mode worse than the error it replaced.
     */
    const [attempt, setAttempt] = useState(0)

    /*
     * `attempt` is a **trigger**, not a read: the body deliberately does not use it. See its own note
     * above — no other dependency changes on a retry, so dropping it leaves `retry()` sending nothing.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger
    useEffect(() => {
        if (!open) {
            minted.current = null
            reset()
            return
        }
        const token = activeId ?? 'anonymous'
        if (minted.current === token) return
        minted.current = token
        setMintedFor(activeId)
        mutate(activeId)
    }, [open, activeId, attempt, mutate, reset])

    const retry = useCallback(() => {
        minted.current = null
        reset()
        // Re-runs the effect above. See `attempt`.
        setAttempt(count => count + 1)
    }, [reset])

    return {
        clientSecret: mutation.data?.clientSecret ?? null,
        accountId: mintedFor,
        isPreparing: open && (mutation.isIdle || mutation.isPending),
        isUnavailable: mutation.isError || (mutation.isSuccess && mutation.data === null),
        retry,
    }
}

export interface UseCardSetupFormResult {
    /** Confirm what is in the elements. `setAsDefault` fires `set-as-default/` after it lands. */
    confirm: (setAsDefault: boolean) => void
    isConfirming: boolean
    /** Stripe's own cardholder-facing sentence, when there is one. Untranslated by nature. */
    errorText: string | null
    /** Our key, for every failure whose message is not the reader's business. */
    errorKey: string | null
    /** Clear the error line — the fields changed, so the last failure no longer describes them. */
    clearError: () => void
}

/**
 * Confirm the SetupIntent that `useAddCard` minted. **Must be rendered inside
 * `<StripeElementsScope>`**, which is where `useStripe` / `useElements` get their context.
 *
 * ## The account comes from the intent, not from "now"
 *
 * `accountId` is a parameter, and it is the account `useAddCard` minted for — *not* whatever is
 * active when the button is pressed. The intent is already bound to one Stripe customer server-side,
 * so if the reader switched accounts with the dialog open, the card attaches to the account that
 * opened it; sending `set-as-default/` and the invalidate as the *new* account would flag a card in a
 * list it is not in. (The switch also re-mints, so this window is a single render — but "a single
 * render" is exactly the width of the bug in §1.4 that this feature exists to not repeat.)
 *
 * ## `redirect: 'if_required'`, and no `elements.submit()`
 *
 * An ordinary card confirms in place, so the reader stays in the dialog and the "make it the default"
 * checkbox can still be honoured. A card whose bank demands 3DS **does** leave the page, and comes
 * back to `return_url` — which is why the URL is built by `checkoutReturnUrl` from
 * `NEXT_PUBLIC_BASE_URL` rather than from `window.location`, per that file's three reasons. On that
 * path the checkbox is lost: the new page load has no dialog state. See `card-management-view.tsx`
 * for what happens on the way back.
 *
 * `elements.submit()` is not called, and should not be: it belongs to the deferred-intent flow.
 * `<Elements>` here is created **with** a client secret, so `confirmSetup` performs the validation
 * pass itself, and calling `submit()` first would run it twice.
 */
export function useCardSetupForm({
    accountId,
    returnPath,
    onSaved,
}: {
    /** The account `useAddCard` minted the intent for. */
    accountId: string | null
    /** Path the 3DS hop returns to — this app's own, never a value from the payload. */
    returnPath: string
    onSaved: () => void
}): UseCardSetupFormResult {
    const stripe = useStripe()
    const elements = useElements()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const [errorText, setErrorText] = useState<string | null>(null)
    const [errorKey, setErrorKey] = useState<string | null>(null)

    const mutation = useMutation({
        mutationFn: async ({ setAsDefault }: { setAsDefault: boolean }) => {
            /*
             * Not reachable from the UI — the submit button is disabled until both exist — but the
             * check is what makes that a fact rather than a convention, and `stripe` is `null` for a
             * real reason (the script is blocked by an extension or refused by CSP).
             */
            if (!stripe || !elements) throw new Error('stripe not ready')

            const result = await stripe.confirmSetup({
                elements,
                confirmParams: { return_url: checkoutReturnUrl(returnPath) },
                redirect: 'if_required',
            })

            // `error` first, always. Legacy reads `.type` off it unguarded (§1.4 #4).
            if (result.error) throw new CardSetupError(result.error)

            /*
             * `payment_method` is a string id when the intent is not expanded, and an object when it
             * is — Stripe's own type is the union, and reading `.id` off a string is `undefined`,
             * which would send `set-as-default/undefined/`.
             */
            const method = result.setupIntent?.payment_method
            const paymentMethodId = typeof method === 'string' ? method : (method?.id ?? null)

            /*
             * The checkbox is honoured **after** the card exists, which is legacy's order too: there
             * is nothing to make default until Stripe has attached it. A failure here is not a failed
             * *save* — the card is saved — so it does not fail the mutation; the refetch below will
             * simply show it as not-default.
             */
            if (setAsDefault && paymentMethodId) {
                try {
                    await paymentMethodsApi.setDefault(paymentMethodId, { accountId })
                } catch {
                    // Deliberately swallowed. See above.
                }
            }
            return paymentMethodId
        },
        onSuccess: () => {
            setErrorText(null)
            setErrorKey(null)
            void queryClient.invalidateQueries({ queryKey: paymentKeys.cards(accountId) })
            toast.success(t('payment_card_added'))
            onSaved()
        },
        onError: error => {
            const stripeError = error instanceof CardSetupError ? error.stripeError : null
            const message = stripeError ? cardholderMessage(stripeError) : null
            setErrorText(message)
            /*
             * One or the other, never both: a form that prints Stripe's decline reason *and* our
             * generic "could not save this card" underneath it is telling the reader the same thing
             * twice, and the second sentence is the less true one.
             */
            setErrorKey(message ? null : 'payment_card_add_failed')
        },
    })

    const { mutate, isPending } = mutation

    const confirm = useCallback(
        (setAsDefault: boolean) => {
            if (isPending || !stripe || !elements) return
            setErrorText(null)
            setErrorKey(null)
            mutate({ setAsDefault })
        },
        [elements, isPending, mutate, stripe],
    )

    const clearError = useCallback(() => {
        setErrorText(null)
        setErrorKey(null)
    }, [])

    return { confirm, isConfirming: isPending, errorText, errorKey, clearError }
}
