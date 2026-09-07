'use client'

import { accountDisplayName, accountEmail, useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { keepFor } from '@shared/lib/api/query-client'
import { useCountry } from '@shared/lib/geo-provider'
import { safeExternalUrl } from '@shared/lib/safe-url'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PayoutCountry, PayoutMethodOption } from '../api/config-types'
import { payoutApi, payoutKeys } from '../api/payout-api'
import { payoutErrorText } from '../lib/payout-error'
import {
    initialPayoutFormValues,
    type PayoutBankVariant,
    type PayoutFormErrors,
    type PayoutFormShape,
    type PayoutFormValues,
    payoutConfigBody,
    payoutFormShape,
    reportPayoutFormDrift,
    validatePayoutForm,
} from '../lib/payout-method-form'
import { PAYOUT_METHOD_PATH } from '../routes'

export interface UseSetupPayoutsResult {
    /** Countries that accept a payout, sorted in the reader's locale. */
    countries: PayoutCountry[]
    isCountriesLoading: boolean
    isCountriesError: boolean
    retryCountries: () => void
    /**
     * The billing country. Preselected from where the visitor is calling from when that is known and
     * payouts are offered there; `null` until they pick otherwise. See the note below.
     */
    country: PayoutCountry | null
    selectCountry: (code: string) => void

    /** The methods on offer for `country`. Empty until one is chosen. */
    methods: PayoutMethodOption[]
    isMethodsLoading: boolean
    isMethodsError: boolean
    /** Chosen and offered, and the country has nothing on offer. A real backend answer. */
    isMethodsEmpty: boolean
    retryMethods: () => void

    selected: PayoutMethodOption | null
    /** `null` collapses the open form, which is what pressing the open row again does. */
    select: (method: PayoutMethodOption | null) => void

    /** The US bank transfer's two tabs. Meaningless for every other method. */
    variant: PayoutBankVariant
    setVariant: (variant: PayoutBankVariant) => void

    /** What to render for `selected` — `null` when nothing is selected. */
    shape: PayoutFormShape | null
    values: PayoutFormValues
    errors: PayoutFormErrors
    setValue: (field: string, value: string) => void

    /** Every field filled in and nothing known to be wrong — legacy's own submit gate. */
    canSubmit: boolean
    isSubmitting: boolean
    submit: () => void

    /** Stripe only: fetch the onboarding link and leave for it. */
    startStripe: () => void
    isStartingStripe: boolean

    isSignedOut: boolean
}

/**
 * The whole state of `/my-wallet/setup-payouts`: a country, a method, that method's form, and the
 * POST at the end of it.
 *
 * ## One hook, where legacy has a context and eight forms
 *
 * Legacy holds this in a provider whose value is a 390-line hook, consumed by eight sibling form
 * components that each re-derive the same four things. The *state* is genuinely one thing — choosing a
 * country invalidates the method, choosing a method invalidates the form — so it is one hook, and the
 * per-method knowledge lives in `lib/payout-method-form.ts` as data rather than in components. No
 * context: the screen is one tree, and the form is rendered by the row that owns the selection.
 *
 * ## The country is preselected, and only when it is a real answer
 *
 * `useCountry()` reports where the visitor is calling from — read off the edge's header during the
 * document render, so it is already known at the first paint (`shared/lib/geo-provider.tsx`). Legacy
 * does the same from its own `fetch('/api/country')` at app open.
 *
 * Three conditions, and all three matter:
 *
 * - **the country is known** — `null` (local dev, an ingress that passes nothing, a failed fallback
 *   request) leaves the field empty and asking. Legacy falls back to `'US'`, which prefills a
 *   Vietnamese creator's form with the wrong country and says nothing about it;
 * - **payouts are offered there** — the code has to be in `payout/countries/`, so a visitor in a
 *   country billy will not pay into is asked rather than shown a dead end;
 * - **nothing has been chosen yet** — a detection that arrives late (the fallback request) must never
 *   move a field somebody has already answered.
 *
 * It stays a *prefill*. Nothing is granted or priced on it — the header behind it is spoofable, and
 * `shared/lib/geo.ts` says so at the source.
 *
 * ## Server state is a query, form state is local, and nothing is mirrored
 *
 * The countries and the methods are TanStack Query (`payoutKeys`); the selection and the field values
 * are `useState` and never written back into the cache. The one place they meet is the submit, which
 * invalidates the *configs* list — the screen the reader lands on next.
 */
export function useSetupPayouts(): UseSetupPayoutsResult {
    const { activeId, currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const { country: detectedCountry } = useCountry()
    const { t, currentLanguage } = useTranslation()
    const queryClient = useQueryClient()
    const router = useRouter()

    const [countryCode, setCountryCode] = useState<string | null>(null)
    const [selected, setSelected] = useState<PayoutMethodOption | null>(null)
    const [variant, setVariantState] = useState<PayoutBankVariant>('individual')
    const [values, setValues] = useState<PayoutFormValues>({})
    const [errors, setErrors] = useState<PayoutFormErrors>({})

    /**
     * A synchronous single-flight latch for the two writes, and **not** redundant with
     * `mutation.isPending`.
     *
     * That flag is last render's, and so is the `disabled` on the button: two presses in one tick — a
     * double-tap on a phone, or Enter in a field followed by a click — both read `false` and both
     * dispatch. For a payout config that means **two identical destinations saved** against one
     * intent, and the client cannot tell them apart afterwards: same method, same detail, two ids. For
     * the Stripe link it means two onboarding sessions, of which the reader can only finish one.
     *
     * The same trap `usePayoutConfigs.remove` documents, found there by a test and fixed here before
     * one was written for it — the write in between is the expensive one.
     */
    const isWriting = useRef(false)

    const countriesQuery = useQuery({
        // Locale-keyed, because the sort is the reader's collation — see `payoutKeys.countries`.
        queryKey: payoutKeys.countries(currentLanguage),
        queryFn: ({ signal }) =>
            payoutApi.getCountries({ locale: currentLanguage, accountId: activeId, signal }),
        enabled: isAuthenticated && Boolean(activeId),
        /*
         * A day. The list of countries billy will pay into changes when a payment partner is
         * onboarded, which is a quarterly event — the 60s default would re-request 250 rows every
         * time this screen is opened.
         */
        ...keepFor(24 * 60 * 60 * 1000),
    })

    const methodsQuery = useQuery({
        queryKey: payoutKeys.methods(activeId, countryCode ?? ''),
        queryFn: ({ signal }) =>
            payoutApi.getMethods({
                // Non-null by `enabled`; the fallback keeps the type honest rather than asserting.
                countryCode: countryCode ?? '',
                accountId: activeId,
                signal,
            }),
        enabled: isAuthenticated && Boolean(activeId) && Boolean(countryCode),
        /*
         * A day, like the country list above and for the same reason: which methods a country
         * offers changes when a payment partner is onboarded. It had no `staleTime` at all, so
         * every pass back through the country step re-requested the same list on the 60s default —
         * and the picker is stepped through forwards and backwards.
         */
        ...keepFor(24 * 60 * 60 * 1000),
    })

    const countries = countriesQuery.data ?? []
    const methods = methodsQuery.data ?? []

    const country = useMemo(
        () => countries.find(entry => entry.code === countryCode) ?? null,
        [countries, countryCode],
    )

    /**
     * Preselect the visitor's own country, once — see the three conditions in the hook's note.
     *
     * `setCountryCode` directly rather than `selectCountry`: that function also drops the selected
     * method and its form, and there is nothing to drop here. It cannot run late enough to matter
     * either, since a method can only be chosen *after* a country, and the `countryCode` guard is what
     * makes it a preselect rather than an override.
     */
    useEffect(() => {
        if (countryCode || !detectedCountry) return
        // Offered there, or there is nothing to select — `countries` is already `allow_payout` only.
        if (!countries.some(entry => entry.code === detectedCountry)) return
        setCountryCode(detectedCountry)
    }, [countryCode, detectedCountry, countries])

    const contactName = accountDisplayName(currentUser) ?? ''
    const contactEmail = accountEmail(currentUser) ?? ''

    const shape = useMemo(
        () => (selected ? payoutFormShape(selected, countryCode ?? '', variant) : null),
        [selected, countryCode, variant],
    )

    const select = useCallback(
        (method: PayoutMethodOption | null) => {
            /*
             * Once per selection, not per render: a dedicated shape ignores `config.form`, so a field
             * the backoffice adds to one of these methods would otherwise show up only as a 400 about
             * a field the reader never saw. Dev-only, see `reportPayoutFormDrift`.
             */
            if (method) reportPayoutFormDrift(method, countryCode ?? '', 'individual')
            setSelected(method)
            setErrors({})
            setVariantState('individual')
            setValues(
                method
                    ? initialPayoutFormValues({
                          method,
                          countryCode: countryCode ?? '',
                          variant: 'individual',
                          contactName,
                          contactEmail,
                      })
                    : {},
            )
        },
        [countryCode, contactName, contactEmail],
    )

    const selectCountry = useCallback((code: string) => {
        setCountryCode(code)
        /*
         * The method belongs to the country — its `id` is only valid for the country it was listed
         * for — so changing the country drops the selection and the form with it. Legacy does the
         * same, and it is not merely tidy: keeping the form would let a reader fill in a Vietnamese
         * bank form and post it against a US method id.
         */
        setSelected(null)
        setValues({})
        setErrors({})
        setVariantState('individual')
    }, [])

    const setVariant = useCallback(
        (next: PayoutBankVariant) => {
            setVariantState(next)
            setErrors({})
            if (!selected) return
            /*
             * The two tabs share `account_number`, `bank_routing_number` and `zipcode`, so what has
             * already been typed is **carried over** rather than blanked. Legacy mounts two separate
             * components and loses everything on a tab press — which, on a form asking for a routing
             * number, is a re-type of the exact fields most likely to be copied from a bank app.
             */
            setValues(previous => {
                const fresh = initialPayoutFormValues({
                    method: selected,
                    countryCode: countryCode ?? '',
                    variant: next,
                    contactName,
                    contactEmail,
                })
                for (const key of Object.keys(fresh)) {
                    if (previous[key]) fresh[key] = previous[key]
                }
                return fresh
            })
        },
        [selected, countryCode, contactName, contactEmail],
    )

    const setValue = useCallback((field: string, value: string) => {
        setValues(previous => ({ ...previous, [field]: value }))
        // The message goes as soon as the field is touched — it was about the old value.
        setErrors(previous => {
            if (!(field in previous)) return previous
            const next = { ...previous }
            delete next[field]
            return next
        })
    }, [])

    const createMutation = useMutation({
        mutationFn: ({
            method,
            accountId,
            formValues,
            bankVariant,
            code,
        }: {
            method: PayoutMethodOption
            accountId: string | null
            formValues: PayoutFormValues
            bankVariant: PayoutBankVariant
            code: string
        }) =>
            payoutApi.createConfig({
                body: payoutConfigBody({
                    method,
                    countryCode: code,
                    variant: bankVariant,
                    values: formValues,
                }),
                accountId,
            }),
        onSuccess: (_data, { accountId }) => {
            // The list on the screen the reader is about to land on, pinned to the account the write
            // was made for.
            queryClient.invalidateQueries({ queryKey: payoutKeys.configs(accountId) })
            toast.success(t('payout_method_added'))
            /*
             * `push`, not `replace`: legacy pushes too, and Back from the method list should return
             * here — adding a second method is the common next move.
             *
             * **Only if that account is still the one on screen.** Switching accounts while the POST
             * is in flight is rare and the consequence is not: the reader would be pushed to *another*
             * account's list of payout destinations, as the answer to a write they can no longer see.
             * The invalidation above is already pinned, so nothing else needs the check.
             */
            if (accountId === activeId) router.push(PAYOUT_METHOD_PATH)
        },
        onError: error => {
            // The app's own abort is not news.
            if (error instanceof ApiError && error.isCanceled) return
            /*
             * The backend's own sentence when it sent one — *"This wallet address is already
             * registered"* is not a key this client can have — and **never `error.message`**, which
             * falls back to axios's own English ("Request failed with status code 500"). The rule and
             * its three conditions are in `lib/payout-error.ts`.
             */
            toast.error(payoutErrorText(error) ?? t('payout_method_add_failed'))
        },
        // Released here rather than in each branch, so a failure leaves the form pressable and a
        // success that did *not* navigate (the account changed) does too.
        onSettled: () => {
            isWriting.current = false
        },
    })

    const canSubmit = useMemo(() => {
        if (shape?.kind !== 'fields') return false
        if (Object.keys(errors).length > 0) return false
        // Legacy's gate: every value present. Stated here so the button and the validator agree.
        if (!(values.contact_name ?? '').trim() || !(values.contact_email ?? '').trim())
            return false
        return shape.fields.every(field => (values[field.field] ?? '').trim() !== '')
    }, [shape, values, errors])

    const submit = useCallback(() => {
        if (!selected || !countryCode || isWriting.current || createMutation.isPending) return
        const found = validatePayoutForm({
            method: selected,
            countryCode,
            variant,
            values,
        })
        if (Object.keys(found).length > 0) {
            setErrors(found)
            return
        }
        // Latched only once the form is *valid*: a rejected press must leave the button pressable.
        isWriting.current = true
        createMutation.mutate({
            method: selected,
            accountId: activeId,
            formValues: values,
            bankVariant: variant,
            code: countryCode,
        })
    }, [selected, countryCode, variant, values, activeId, createMutation])

    const stripeMutation = useMutation({
        mutationFn: ({
            method,
            accountId,
        }: {
            method: PayoutMethodOption
            accountId: string | null
        }) => {
            /*
             * Absolute, and built from the browser's own origin rather than an env var: Stripe
             * rejects a relative URL, and a preview deploy has to come back to the preview deploy.
             * Both point at the method list — the screen that will show the new method once Stripe
             * has finished with it, which is legacy's choice too.
             */
            const back = `${window.location.origin}${PAYOUT_METHOD_PATH}`
            return payoutApi.stripeOnboardLink({
                methodId: method.id,
                refreshUrl: back,
                returnUrl: back,
                accountId,
            })
        },
        onSuccess: link => {
            /*
             * `safeExternalUrl` before navigating: this URL comes off the wire, and `location.assign`
             * honours `javascript:` — which would run as us. The check is cheap and the sink is one of
             * the two in this app that execute without a click.
             */
            const url = safeExternalUrl(link?.url)
            if (!url) {
                toast.error(t('payout_method_stripe_failed'))
                return
            }
            /*
             * **Same tab.** Legacy calls `window.open(url, '_seft')` — a typo for `_self`, and an
             * unknown window name opens a popup, which every blocker eats. Onboarding is a flow the
             * reader is meant to complete and be returned from, so it replaces the page.
             */
            window.location.assign(url)
        },
        onError: error => {
            if (error instanceof ApiError && error.isCanceled) return
            // Same rule as the create above — the body's sentence or our key, never axios's.
            toast.error(payoutErrorText(error) ?? t('payout_method_stripe_failed'))
        },
        onSettled: () => {
            isWriting.current = false
        },
    })

    const startStripe = useCallback(() => {
        if (!selected || isWriting.current || stripeMutation.isPending) return
        isWriting.current = true
        stripeMutation.mutate({ method: selected, accountId: activeId })
    }, [selected, activeId, stripeMutation])

    return {
        countries,
        isCountriesLoading: countriesQuery.isLoading,
        isCountriesError: countriesQuery.isError,
        retryCountries: () => {
            countriesQuery.refetch()
        },
        country,
        selectCountry,

        methods,
        isMethodsLoading: methodsQuery.isLoading && Boolean(countryCode),
        isMethodsError: methodsQuery.isError,
        isMethodsEmpty:
            Boolean(countryCode) &&
            !methodsQuery.isLoading &&
            !methodsQuery.isError &&
            methods.length === 0,
        retryMethods: () => {
            methodsQuery.refetch()
        },

        selected,
        select,
        variant,
        setVariant,

        shape,
        values,
        errors,
        setValue,

        canSubmit,
        isSubmitting: createMutation.isPending,
        submit,

        startStripe,
        isStartingStripe: stripeMutation.isPending,

        isSignedOut: !isBootstrapping && !isAuthenticated,
    }
}
