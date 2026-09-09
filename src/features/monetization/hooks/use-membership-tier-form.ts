'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MyPackage } from '../api/types'
import {
    MEMBERSHIP_DESCRIPTION_MAX,
    MEMBERSHIP_NAME_MAX,
    MEMBERSHIP_PRICE_LADDER,
    matchPriceRung,
    pricesPayload,
} from '../lib/membership-tier'
import { writeErrorText } from '../lib/write-error-text'

/**
 * The setup form's state — name, price rung, description, and the one write behind Save.
 *
 * ## Populated from the saved tier, once
 *
 * The effect keys on the tier's **id**, not on the object: the query refetches after every write, so
 * keying on identity would re-seed the fields from the server while somebody was typing in them.
 * Legacy's effect depends on `currentPackage` and has exactly that behaviour.
 *
 * ## A price the ladder does not contain is refused, not rounded
 *
 * `matchPriceRung` answers `-1` for a tier priced outside the five rungs. Legacy ignores that case
 * (`if (matchIndex >= 0) setPriceIndex(matchIndex)`), which leaves the slider on rung 0 — so opening
 * the form on a $12 tier and pressing Save **lowers it to $2**, silently, with no interaction that
 * looks like a price change. Here the rung is `null` until the reader picks one, Save stays disabled,
 * and the form says the price has to be chosen again. That is the honest version of a state the
 * client cannot represent.
 *
 * ## The API's message wins on a failed write
 *
 * `docs/API_ERRORS.md`: on a 4xx the backend is the only party that knows why *that* write was
 * refused, so its sentence is shown and ours is the fallback. Read off the **response body**, never
 * `ApiError.message` — whose chain ends in axios's own English. It lands **in the form**, under
 * Save, with no toast: the same news twice, once in the less useful place, is what that doc rules
 * out, and it is why the mutation sets no `meta.showErrorToast`.
 */
export interface MembershipTierFormState {
    name: string
    setName: (value: string) => void
    description: string
    setDescription: (value: string) => void
    /** Index into `MEMBERSHIP_PRICE_LADDER`, or `null` when the saved price is off the ladder. */
    rung: number | null
    setRung: (index: number) => void
    /** True when the saved tier's price matched no rung — the form says so and Save is held. */
    priceNeedsReselect: boolean
    isEditing: boolean
    canSave: boolean
    /** The API's own sentence for a failed write, or `null`. */
    errorText: string | null
    submit: () => Promise<boolean>
    isSaving: boolean
    nameMax: number
    descriptionMax: number
}

export function useMembershipTierForm({
    tier,
    save,
    isSaving,
    onSaved,
}: {
    tier: MyPackage | null | undefined
    save: (payload: ReturnType<typeof buildPayload>) => Promise<unknown>
    isSaving: boolean
    onSaved: () => void
}): MembershipTierFormState {
    const { t } = useTranslation()
    const [name, setNameRaw] = useState('')
    const [description, setDescriptionRaw] = useState('')
    const [rung, setRung] = useState<number | null>(0)
    const [priceNeedsReselect, setPriceNeedsReselect] = useState(false)
    const [errorText, setErrorText] = useState<string | null>(null)

    const tierId = tier?.id ?? null

    /*
     * Keyed on the **id**, deliberately, and the omitted deps are the point rather than an oversight:
     * the query refetches after every write, so depending on `tier` (or on its fields) would re-seed
     * the form from the server while somebody was typing in it. Legacy's effect depends on
     * `currentPackage` and has exactly that behaviour.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: seeding is per tier identity, not per payload
    useEffect(() => {
        if (!tier) return
        setNameRaw(tier.name ?? '')
        setDescriptionRaw(tier.description ?? '')
        const matched = matchPriceRung(tier)
        setRung(matched >= 0 ? matched : null)
        setPriceNeedsReselect(matched < 0)
    }, [tierId])

    /*
     * Truncated on the way in, which is legacy's behaviour (it refuses the keystroke past the
     * limit) — and `slice` rather than a refusal so a **paste** lands as much as fits instead of
     * being dropped whole, which is what refusing does to a 600-character paste.
     */
    const setName = (value: string) => {
        setErrorText(null)
        setNameRaw(value.slice(0, MEMBERSHIP_NAME_MAX))
    }
    const setDescription = (value: string) => {
        setErrorText(null)
        setDescriptionRaw(value.slice(0, MEMBERSHIP_DESCRIPTION_MAX))
    }

    const canSave = name.trim().length > 0 && rung !== null && !isSaving

    return {
        name,
        setName,
        description,
        setDescription,
        rung,
        setRung: index => {
            setPriceNeedsReselect(false)
            setErrorText(null)
            setRung(index)
        },
        priceNeedsReselect,
        isEditing: Boolean(tier),
        canSave,
        errorText,
        isSaving,
        nameMax: MEMBERSHIP_NAME_MAX,
        descriptionMax: MEMBERSHIP_DESCRIPTION_MAX,
        submit: async () => {
            if (!canSave || rung === null) return false
            setErrorText(null)
            const wasEditing = Boolean(tier)
            try {
                await save(buildPayload({ name, description, rung }))
                /*
                 * A write must not resolve silently (`docs/DEFINITION_OF_DONE.md` §2), and closing
                 * the form is not feedback on its own: **editing** returns to a dashboard that looks
                 * identical unless the name or the price changed, so a creator who fixed a typo in
                 * the description gets no signal at all that it landed. Legacy shows nothing here
                 * either — its `handleSave` just navigates back.
                 *
                 * Success only. A *failure* stays in the form, under Save, because the API's own
                 * sentence belongs next to the control that produced it and never in a toast as well
                 * — the rule in `docs/API_ERRORS.md`, and why the mutation sets no `meta`.
                 */
                toast.success(
                    t(
                        wasEditing
                            ? 'monetization_membership_updated'
                            : 'monetization_membership_created',
                    ),
                )
                onSaved()
                return true
            } catch (error) {
                setErrorText(writeErrorText(error))
                return false
            }
        },
    }
}

/**
 * The write body.
 *
 * `description` is **omitted when blank** rather than sent as `''` — legacy's shape
 * (`if (description.trim()) payload.description = ...`). Kept because the two are not the same
 * request: an absent key and an empty string are only equivalent if the backend treats them so, and
 * that is not established (**B103**).
 */
export function buildPayload({
    name,
    description,
    rung,
}: {
    name: string
    description: string
    rung: number
}) {
    const trimmed = description.trim()
    return {
        name: name.trim(),
        prices: pricesPayload(MEMBERSHIP_PRICE_LADDER[rung]),
        ...(trimmed ? { description: trimmed } : {}),
    }
}
