'use client'

import { accountTwoFaPasscode, useAuth } from '@features/auth'
import { useBalance } from '@features/balance'
import { keepFor } from '@shared/lib/api/query-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PayoutConfigRow } from '../api/config-types'
import {
    PAYOUT_MIN_AMOUNT,
    type PayoutOption,
    type PayoutQuote,
    payoutRequestApi,
    payoutRequestKeys,
} from '../api/payout-request-api'
import {
    type PayoutAmountError,
    payoutAmountError,
    payoutAmountPayload,
    payoutMaxAmount,
    payoutSuggestedAmount,
} from '../lib/payout-amount'
import { type PayoutRequestOutcome, payoutRequestOutcome } from '../lib/payout-request-errors'
import { usePayoutConfigs } from './use-payout-configs'

/**
 * `/my-wallet/payout-request` — the state behind the withdraw form.
 *
 * Legacy's `usePayoutRequest.js` is 427 lines holding two lists, a debounced quote, four booleans of
 * dialog state and the submit. This is the same behaviour with the parts that are *server state* handed
 * to TanStack Query, which removes most of it: the two lists and the quote stop being `useState` +
 * `useEffect` + manual `isLoading`, and the quote stops being a `setTimeout` that races itself.
 *
 * ## What is still local state, and why each one has to be
 *
 * - **`amount`** — the reader is typing it. Server state it is not.
 * - **`configId` / `optionId`** — a selection. Seeded from the lists once they arrive (legacy takes
 *   `results[0]` for both) and then owned by the reader.
 * - **`amountError`** — a *server* verdict on the amount, merged with the local one. See `fieldError`.
 * - **`outcome`** — what the last failed submit meant, so the screen can raise the verification dialog
 *   rather than a toast. Cleared on the next attempt.
 *
 * ## The quote is a query, not a debounced fetch
 *
 * Legacy holds a `timeOutRef`, clears it on every keystroke and calls `quote()` after 1000ms, writing
 * into two `useState`s. Two things fall out of that: a slow answer for `100` can land after a fast one
 * for `1000` and overwrite it, and a failure leaves the previous quote on screen with no way to tell.
 *
 * Here the **amount is part of the query key**, so an answer can only ever be applied to the amount it
 * was asked for — the race is not handled, it cannot happen. The 1000ms debounce is kept as a debounce
 * on the *key* (`debouncedAmount`), which is what legacy's timer was actually for: not racing, but not
 * quoting every keystroke.
 */
export interface UsePayoutRequestFormResult {
    /** Withdraw methods the account has set up, active only. */
    methods: PayoutConfigRow[]
    /** The chosen method, or `null` before the list arrives. */
    method: PayoutConfigRow | null
    selectMethod: (id: string) => void

    /** The withdraw speeds on offer, gated — see `options`. */
    options: PayoutOption[]
    option: PayoutOption | null
    selectOption: (id: string) => void

    /** What the reader typed, as a number. `null` for an empty field. */
    amount: number | null
    setAmount: (value: number | null) => void
    /** The ceiling for the chosen method — `min(balance, dailyLimitRemainder)`. */
    maxAmount: number
    /** The method's own floor, or legacy's 10 when it states none — see `minAmount` in the hook. */
    minAmount: number
    /** The wallet's own balance, for the "available" line. */
    balance: number
    /** The settlement currency of the chosen method — `VND`, `USD`. */
    currency: string
    /**
     * The rate to print in the amount header — `$1.00 ≈ <rate> <currency>`.
     *
     * **The quote's rate wins over the method's**, which is legacy's own precedence
     * (`payoutSummary?.exchange_rate ? … : payoutMethod?.exchange_rate`): once a price has been quoted,
     * the rate it was priced at is the one that explains the net figure beside it. `null` when neither
     * states one, so the header is withheld rather than printing `≈ 0`.
     */
    exchangeRate: number | null

    /** The server's price, or `null` while it is being fetched or when it failed. */
    quote: PayoutQuote | null
    isQuoting: boolean
    /** `true` when the quote failed — the screen withholds the figures rather than showing stale ones. */
    isQuoteError: boolean

    /**
     * What to show under the field: the local rule, or the server's verdict on the last submit.
     * `null` when the figure is fine.
     */
    fieldError: PayoutAmountError | { key: null; text: string } | null

    /** Ready to submit — a method, an option, a valid amount, and nothing in flight. */
    canSubmit: boolean
    isSubmitting: boolean
    /**
     * **Two-step verification is on for this account** — the withdrawal has to carry a passcode.
     *
     * Exposed rather than left to the screen so the flag is read in one place: the screen's job is to
     * raise `TwoStepVerificationDialog` and hand what comes back to `submit`, not to know which field
     * of `/me` decides that.
     *
     * It is a **hint, not the gate**. The server refuses a request that needs a passcode, and
     * `payoutRequestOutcome`'s `passcode-required` turns that refusal into the same step — so a stale
     * profile costs a round trip. See `accountTwoFaPasscode` for why the default direction is off.
     */
    requiresPasscode: boolean
    /**
     * Send the withdrawal.
     *
     * `passcode` is the code `TwoStepVerificationDialog` just had accepted, and it goes on the request
     * as well as having been verified — legacy sends both (`payoutRequest(passcode)`), and the write is
     * the call the backend actually enforces. Omitted for an account without two-step verification, and
     * `createRequest` then leaves the field off the body rather than sending `''`.
     */
    submit: (passcode?: string) => void
    /** What the last failure meant. The screen reads this to decide dialog vs message. */
    outcome: PayoutRequestOutcome | null
    dismissOutcome: () => void
    /** The created request's id, once it exists — the screen navigates to its detail. */
    createdId: string | null

    isLoading: boolean
    isSignedOut: boolean
    /** No active withdraw method — legacy sends the reader to `setup-payouts`. */
    hasNoMethod: boolean
}

export function usePayoutRequestForm(): UsePayoutRequestFormResult {
    const { activeId, currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const { usd: balance } = useBalance()
    const queryClient = useQueryClient()

    const configs = usePayoutConfigs()

    const optionsQuery = useQuery({
        queryKey: payoutRequestKeys.options(activeId),
        queryFn: ({ signal }) => payoutRequestApi.getOptions({ accountId: activeId, signal }),
        enabled: isAuthenticated && Boolean(activeId),
        /*
         * An hour, matching the record's own TTL: the two withdraw speeds and their fees are
         * platform config, not this account's. Shorter than the day the country list gets because
         * `is_active` is a switch the platform flips to stop offering a speed — the ETag makes a
         * stale one impossible to *serve*, but there is no reason to hold the validator longer.
         */
        ...keepFor(60 * 60 * 1000),
    })

    const [configId, setConfigId] = useState<string | null>(null)
    const [optionId, setOptionId] = useState<string | null>(null)
    const [amount, setAmountState] = useState<number | null>(null)
    const [serverFieldText, setServerFieldText] = useState<string | null>(null)
    const [outcome, setOutcome] = useState<PayoutRequestOutcome | null>(null)
    const [createdId, setCreatedId] = useState<string | null>(null)

    /*
     * Only the options this client can draw a card for. `payoutOptionKind` returns `null` for an id
     * outside `saving | fast`, and an option with no card would be a radio with no label — worse than
     * one fewer choice. Legacy's `RenderOption` returns an empty fragment for the same case, which
     * leaves a gap in its grid instead.
     */
    /*
     * Only the options this client can draw a card for. **`is_active` is not filtered on** — I did that
     * first and it was the wrong reading.
     *
     * `is_active: false` on `fast` does not mean the platform switched the speed off; it means it is
     * **not open to this account**. So the card is still drawn, still says *Only for Premium users*, and
     * pressing it raises the upsell. Hiding it would remove the one place on this screen where Premium
     * is sold — and the product decision is that the offer is the point.
     *
     * The flag is still parsed and carried: `PayoutOptionCards` reads it alongside `isPremium` to decide
     * whether a press selects or sells.
     */
    const options = useMemo(
        () => (optionsQuery.data ?? []).filter(option => option.kind !== null),
        [optionsQuery.data],
    )

    const method = useMemo(
        () => configs.methods.find(row => row.id === configId) ?? null,
        [configs.methods, configId],
    )
    const option = useMemo(
        () => options.find(row => row.id === optionId) ?? null,
        [options, optionId],
    )

    /*
     * Seed both selections from the first row, once — legacy's `setSelectedPayoutMethod(results[0])`.
     * Guarded on the current value rather than a `didSeed` ref so that a list arriving empty and then
     * populating (a refetch after `setup-payouts`) still seeds.
     */
    useEffect(() => {
        if (configId === null && configs.methods.length > 0) setConfigId(configs.methods[0].id)
    }, [configId, configs.methods])
    useEffect(() => {
        if (optionId === null && options.length > 0) setOptionId(options[0].id)
    }, [optionId, options])

    const maxAmount = useMemo(
        () => payoutMaxAmount(balance, method?.dailyLimitRemainder ?? null),
        [balance, method?.dailyLimitRemainder],
    )

    /*
     * Fill the field with the largest allowed figure once, when the ceiling is first known — legacy's
     * effect, and the reason it exists: a creator opening this screen almost always wants to withdraw
     * what they have. `hasSeededAmount` rather than `amount === null`, so clearing the field by hand
     * does not immediately refill it.
     */
    /**
     * **A synchronous latch beside `createMutation.isPending`, because that flag is last render's.**
     *
     * `isPending` only becomes true after a re-render, so two calls in the *same* tick both read `false`
     * and both fire. On a list that is a duplicate fetch; here it is a **duplicate withdrawal** — and the
     * request is deliberately never retried by the transport precisely because it may not be idempotent.
     *
     * A double-click on the confirm button, or Enter held on it, is exactly that tick. The dialog closes
     * before `submit` runs, which narrows the window but does not close it: both handlers have already
     * been queued by then.
     *
     * The same latch `useWalletLedger` carries on `fetchNextPage`, where three calls in one act produced
     * three requests for page 2 — measured. This is the version of that bug that costs money.
     */
    const isSubmittingRef = useRef(false)

    const hasSeededAmount = useRef(false)
    useEffect(() => {
        if (hasSeededAmount.current || maxAmount <= 0) return
        hasSeededAmount.current = true
        setAmountState(payoutSuggestedAmount(balance, method?.dailyLimitRemainder ?? null))
    }, [balance, maxAmount, method?.dailyLimitRemainder])

    const setAmount = useCallback((value: number | null) => {
        setAmountState(value)
        // The server's verdict was about the previous figure — it must not outlive it.
        setServerFieldText(null)
        setOutcome(null)
    }, [])

    /**
     * Switching method clamps the figure down to the new ceiling — legacy's `handleSelectMethod`.
     *
     * Clamping rather than clearing: the reader chose a method, not a new amount, and making them retype
     * a figure the new method simply caps is friction with no information in it.
     */
    const selectMethod = useCallback(
        (id: string) => {
            setConfigId(id)
            setServerFieldText(null)
            setOutcome(null)
            const next = configs.methods.find(row => row.id === id)
            const nextMax = payoutMaxAmount(balance, next?.dailyLimitRemainder ?? null)
            setAmountState(current => {
                if (nextMax <= 0) return null
                return current === null || current > nextMax ? nextMax : current
            })
        },
        [balance, configs.methods],
    )

    const selectOption = useCallback((id: string) => {
        setOptionId(id)
        setOutcome(null)
    }, [])

    /*
     * **The method's own floor**, falling back to legacy's 10. The live payload puts `"15.00"` on VAI
     * Wallet and `null` on bank transfer, so a single constant refuses nothing on one method and lets a
     * doomed request through on the other.
     */
    const minAmount = method?.methodMinimumAmount ?? PAYOUT_MIN_AMOUNT
    const localError = useMemo(
        () => payoutAmountError(amount, maxAmount, minAmount),
        [amount, maxAmount, minAmount],
    )

    /*
     * The quote's amount, debounced. Legacy's 1000ms — what its timer was for was not racing (the query
     * key handles that) but not asking on every keystroke.
     */
    const [debouncedAmount, setDebouncedAmount] = useState<number | null>(null)
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedAmount(amount), 1000)
        return () => clearTimeout(timer)
    }, [amount])

    const quotableAmount = localError === null && debouncedAmount !== null ? debouncedAmount : null

    const quoteQuery = useQuery({
        queryKey: payoutRequestKeys.quote(
            activeId,
            configId ?? '',
            optionId ?? '',
            quotableAmount === null ? '' : payoutAmountPayload(quotableAmount),
        ),
        queryFn: ({ signal }) =>
            payoutRequestApi.getQuote({
                configId: configId as string,
                optionId: optionId as string,
                amount: payoutAmountPayload(quotableAmount as number),
                accountId: activeId,
                signal,
            }),
        enabled:
            isAuthenticated &&
            Boolean(activeId) &&
            Boolean(configId) &&
            Boolean(optionId) &&
            quotableAmount !== null,
        /*
         * A quote is a **price**, so it must not be served stale: `staleTime: 0` overrides the client's
         * 60s default. The key already pins it to one amount, so this only affects re-asking for the
         * same amount after a remount — which is exactly when a fresh price is wanted.
         */
        staleTime: 0,
        retry: false,
    })

    const createMutation = useMutation({
        mutationFn: (input: {
            configId: string
            optionId: string
            amount: number
            quoteId: string
            passcode: string
        }) =>
            payoutRequestApi.createRequest({
                configId: input.configId,
                optionId: input.optionId,
                amount: payoutAmountPayload(input.amount),
                quoteId: input.quoteId || undefined,
                /*
                 * `|| undefined`, so an empty string never reaches the body: `createRequest` builds the
                 * payload field by field precisely so an absent passcode is *absent*. Legacy sends
                 * `passcode: ''` on every request an account without 2FA makes.
                 */
                passcode: input.passcode || undefined,
                accountId: activeId,
            }),
        onSuccess: created => {
            /*
             * The balance moved, and so did every list that explains it — the ledger, the payout
             * tracking list, the daily-limit remainder on each config. One invalidation at
             * `balanceKeys.all` covers all of them, which is the reason every wallet key is nested
             * under it.
             */
            void queryClient.invalidateQueries({ queryKey: payoutRequestKeys.all.slice(0, 1) })
            setCreatedId(created.id || null)
        },
        onSettled: () => {
            // Released on both paths: a failed attempt must be retryable, a successful one is navigating
            // away and the release costs nothing.
            isSubmittingRef.current = false
        },
        onError: error => {
            const next = payoutRequestOutcome(error)
            setOutcome(next)
            /*
             * An amount verdict goes **on the field**, not into a dialog: the fix is to edit the number,
             * and a message that sits anywhere else is a message the reader has to remember while they
             * look back at the input.
             */
            if (next.kind === 'amount-rejected') setServerFieldText(next.message ?? null)
        },
    })

    const canSubmit =
        Boolean(configId) &&
        Boolean(optionId) &&
        localError === null &&
        amount !== null &&
        !createMutation.isPending

    /**
     * The held price, **only if it is still this price**.
     *
     * Two ways a `quote_id` can be the wrong one, and both were live:
     *
     * 1. **It can belong to a different figure.** The quote query is keyed on a *debounced* amount, so
     *    for up to a second after a keystroke `quoteQuery.data` is the answer for the **previous** sum.
     *    Type `5000`, wait for the quote, change it to `100`, press Send inside that second — and the
     *    request left as `amount: "100.00"` with the id of the 5,000 quote. Asking the server to honour
     *    a price it quoted for fifty times the money is not a race worth leaving open.
     * 2. **It can be expired.** The payload gives 300 seconds (`expires_at`), and a tab left open past
     *    that submits an id the server has already dropped — a 4xx where a fresh price would have
     *    worked.
     *
     * So the id is sent only when the quote's **own** `amount` matches what is being submitted *and* it
     * has not expired. Otherwise the field is omitted and the server prices the request fresh, which the
     * schema allows (`quote_id` is optional) and which is the safe direction: a fresh price is correct
     * by construction, where a mismatched one is a figure nobody on this screen agreed to.
     *
     * Compared on the **payload string** rather than on the numbers: that is what actually goes over the
     * wire, so `4400.035` and `4400.03` cannot be treated as equal by a float comparison that the server
     * would then disagree with.
     */
    const usableQuoteId = useMemo(() => {
        const quote = quoteQuery.data
        if (!quote?.id || amount === null || quote.amount === null) return ''
        if (payoutAmountPayload(quote.amount) !== payoutAmountPayload(amount)) return ''
        if (quote.expiresAt !== null && quote.expiresAt <= Date.now()) return ''
        return quote.id
    }, [amount, quoteQuery.data])

    const submit = useCallback(
        (passcode?: string) => {
            if (!canSubmit || !configId || !optionId || amount === null) return
            // The latch, before anything async — see `isSubmittingRef`.
            if (isSubmittingRef.current) return
            isSubmittingRef.current = true
            setOutcome(null)
            setServerFieldText(null)
            createMutation.mutate({
                configId,
                optionId,
                amount,
                quoteId: usableQuoteId,
                /*
                 * **Not held in state.** A passcode is a credential, so it lives exactly as long as the
                 * call that presents it: parked in a `useState` it would survive on the heap for the
                 * rest of the visit, be readable from a React DevTools tree, and — worse — be available
                 * to a *second* submit the reader never authorised with it. It arrives as an argument
                 * from the dialog and leaves in the request body.
                 */
                passcode: passcode ?? '',
            })
        },
        [amount, canSubmit, configId, createMutation, optionId, usableQuoteId],
    )

    /*
     * Whether the quote in hand was priced for the figure now in the field. Separate from
     * `usableQuoteId`, which additionally requires it not to have expired: an expired quote's
     * *figures* are still the right ones to look at while a fresh one loads, but its **id** must not
     * be submitted.
     */
    const matchesAmount =
        quoteQuery.data?.amount != null &&
        amount !== null &&
        payoutAmountPayload(quoteQuery.data.amount) === payoutAmountPayload(amount)

    const isSignedOut = !isBootstrapping && !isAuthenticated

    return {
        methods: configs.methods,
        method,
        selectMethod,
        options,
        option,
        selectOption,
        amount,
        setAmount,
        maxAmount,
        minAmount,
        balance,
        currency: method?.methodCurrency ?? '',
        /*
         * Legacy rounds to two before printing (`roundToTwo(parseFloat(...))`), and the payout detail
         * screen already does the same for its fee arithmetic — see `payoutComputeRate`, which found
         * this the hard way: the unrounded rate produced a figure 8,233 VND off legacy's.
         */
        exchangeRate: (() => {
            /*
             * The quote's rate once there is one, else the **method's** — legacy's precedence
             * (`payoutSummary?.exchange_rate ? … : payoutMethod?.exchange_rate`). Rounded to two
             * before printing, as legacy does: `payoutComputeRate` found that the unrounded rate is a
             * different number, off by 8,233 VND on a real payout.
             */
            const raw = quoteQuery.data?.exchangeRate ?? method?.methodExchangeRate ?? null
            return raw === null ? null : Math.round(raw * 100) / 100
        })(),
        /*
         * **The quote is withheld once it stops matching the typed figure.** Otherwise the footer keeps
         * showing the previous net through the debounce window, and the reader presses Send while
         * looking at a number for a different amount. `isQuoting` covers the fetch; this covers the
         * second *before* the fetch starts.
         */
        quote: matchesAmount ? (quoteQuery.data ?? null) : null,
        /*
         * Fetching **or** waiting for the debounce to catch up. Without the second half the summary looks
         * settled for a second after every keystroke, showing the previous price as though it were
         * current — which is the same class of mistake as submitting the stale id.
         */
        isQuoting:
            quoteQuery.isFetching || (amount !== null && localError === null && !matchesAmount),
        isQuoteError: quoteQuery.isError,
        /*
         * The server's sentence wins over the local rule when there is one: it is the more specific
         * statement, and it is the reason the submit just failed.
         */
        fieldError: serverFieldText ? { key: null, text: serverFieldText } : localError,
        canSubmit,
        isSubmitting: createMutation.isPending,
        requiresPasscode: accountTwoFaPasscode(currentUser),
        submit,
        outcome,
        dismissOutcome: useCallback(() => setOutcome(null), []),
        createdId,
        isLoading: configs.isLoading || optionsQuery.isLoading,
        isSignedOut,
        /*
         * **Signed-out is excluded, and leaving it out was a real bug.** A guest has no methods and no
         * loading state, so the naive condition was true immediately and every visit bounced to
         * `setup-payouts` — measured in the browser: the sign-in screen was never reachable.
         *
         * `isError` is excluded for the same shape of reason: a failed list is not an empty one, and
         * redirecting on a 502 sends somebody who *has* methods to a setup screen they do not need.
         */
        hasNoMethod:
            !isSignedOut &&
            !isBootstrapping &&
            !configs.isLoading &&
            !configs.isError &&
            configs.methods.length === 0,
    }
}
