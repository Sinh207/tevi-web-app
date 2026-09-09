'use client'

import { useEffect, useState } from 'react'
import type { DonationSetting, DonationTerm, DonationUnit } from '../api/donation-types'
import {
    buildDonationPayload,
    DONATION_MESSAGE_MAX,
    type DonationFormValues,
    donationAmountValue,
    donationFormChanged,
    donationFormValues,
    parseDonationAmountInput,
    starsForUsd,
} from '../lib/donation-setting'
import { writeErrorText } from '../lib/write-error-text'

/**
 * The donation setup form's state — the unit, the price, the term, the message, the two switches,
 * and the one write behind Save.
 *
 * ## Seeded from the saved offer, once per offer
 *
 * The effect keys on the setting's **id**, not on the object, for the reason
 * `useMembershipTierForm` gives at length: the query refetches after every write, so keying on
 * identity would re-seed the fields from the server while somebody was typing in them. Legacy's
 * effect depends on `donation` and has exactly that behaviour — with one extra consequence here,
 * because this form has *toggles*: a refetch landing mid-edit would flip a switch under the reader's
 * finger.
 *
 * ## The price is a **string**, all the way to the payload
 *
 * `parseDonationAmountInput` explains why: `"10."` has to exist between two keystrokes, and a number
 * cannot hold it. `starEquivalent` reads through `donationAmountValue`, so a half-typed price shows
 * the Star figure for what has been typed so far rather than `NaN Star`.
 *
 * ## Save is held for three reasons, and two of them are legacy's
 *
 * A write in flight and **no changes** are legacy's (`disabled={isSaving || !hasChanges}`). The
 * third is not: legacy will happily save an **empty or zero price**, posting `prices: [{ amount:
 * "0.00" }]` — an offer nobody can buy, and one that reads as free. `canSave` requires an amount
 * above zero.
 *
 * ## The API's message wins on a failed write
 *
 * `docs/API_ERRORS.md`, via this feature's own `writeErrorText`. It lands **in the form**, above
 * Save, with no toast — the same news twice, once in the less useful place, is what that doc rules
 * out. It is also what makes the two limits the schema declares (`name` 50, `thank_you_msg` 500)
 * diagnosable at all if one is ever exceeded by a route this form does not own.
 */
export interface DonationFormState {
    values: DonationFormValues
    setUnit: (unit: DonationUnit) => void
    setAmount: (raw: string) => void
    setTerm: (term: DonationTerm) => void
    setMessage: (value: string) => void
    setDisplaySupporterCount: (checked: boolean) => void
    setIsActive: (checked: boolean) => void
    /** The Star figure the amount is advertised at, ready to print. */
    starEquivalent: number
    /** There is a saved offer, so Save is an edit rather than a creation. */
    isEditing: boolean
    canSave: boolean
    /** The API's own sentence for a failed write, or `null`. */
    errorText: string | null
    submit: () => Promise<boolean>
    isSaving: boolean
    messageMax: number
}

export function useDonationForm({
    setting,
    save,
    isSaving,
    onSaved,
}: {
    setting: DonationSetting | null | undefined
    save: (payload: ReturnType<typeof buildDonationPayload>) => Promise<unknown>
    isSaving: boolean
    onSaved: () => void
}): DonationFormState {
    const [values, setValues] = useState<DonationFormValues>(() => donationFormValues(setting))
    const [errorText, setErrorText] = useState<string | null>(null)

    const settingId = setting?.id ?? null

    /*
     * Keyed on the **id**, deliberately, and the omitted deps are the point rather than an oversight
     * — see the note above. `donationFormValues` is pure and derives everything from the argument,
     * so nothing else can go stale.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: seeding is per offer identity, not per payload
    useEffect(() => {
        setValues(donationFormValues(setting))
        setErrorText(null)
    }, [settingId])

    /** Every setter clears the last write's error: the reader has changed what they are saving. */
    const patch = (next: Partial<DonationFormValues>) => {
        setErrorText(null)
        setValues(current => ({ ...current, ...next }))
    }

    const starEquivalent = starsForUsd(donationAmountValue(values.amount))
    const canSave =
        donationAmountValue(values.amount) > 0 && !isSaving && donationFormChanged(values, setting)

    return {
        values,
        setUnit: unit => patch({ unit }),
        setAmount: raw => {
            setErrorText(null)
            setValues(current => ({
                ...current,
                amount: parseDonationAmountInput(raw, current.amount),
            }))
        },
        setTerm: term => patch({ term }),
        /*
         * Truncated on the way in, which the schema requires (`maxLength: 500`) and legacy does not
         * enforce at all — it posts the whole thing and lets billy refuse it. `slice` rather than a
         * refusal so a **paste** lands as much as fits instead of being dropped whole, which is the
         * call `useMembershipTierForm` makes for the same reason.
         */
        setMessage: value => patch({ message: value.slice(0, DONATION_MESSAGE_MAX) }),
        setDisplaySupporterCount: displaySupporterCount => patch({ displaySupporterCount }),
        setIsActive: isActive => patch({ isActive }),
        starEquivalent,
        isEditing: Boolean(setting),
        canSave,
        errorText,
        isSaving,
        messageMax: DONATION_MESSAGE_MAX,
        submit: async () => {
            if (!canSave) return false
            setErrorText(null)
            try {
                await save(buildDonationPayload(values))
                onSaved()
                return true
            } catch (error) {
                setErrorText(writeErrorText(error))
                return false
            }
        },
    }
}
