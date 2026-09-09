'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { FieldLabel } from '@shared/ui/field-label'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useId } from 'react'
import type { MembershipTierFormState } from '../hooks/use-membership-tier-form'
import { BRAND_NOTICE } from '../lib/container'
import { MEMBERSHIP_SYSTEM_FEE_PERCENT } from '../lib/membership-tier'
import { PriceLadder } from './price-ladder'

/**
 * The create/edit form — name, monthly price, description, the fee notice, and Save.
 *
 * ## The boxes carry their own edges, because the screen under them is a surface
 *
 * Below `md` this screen paints `--background-surface` (`MEMBERSHIP_SCREEN`), and a form of plain
 * surface-coloured boxes on that plane does not read as a mismatch — it **disappears**. So the two
 * text fields take the DS's own **input** tokens (`--input-bg` on an `--input-border` hairline,
 * `--input-border-focus` on focus), which is what they should have been using in the first place and
 * what makes them read as fields rather than as gaps; the price card takes a `--separator-default`
 * hairline for the same reason; and the fee notice is already tinted and outlined.
 *
 * Both ramps flip with the mode, so this is one set of tokens for both themes — and from `md`, where
 * the page colour returns, the edges are simply the field edges the DS draws anyway.
 *
 * ## Every field is bounded in the field, and the counter says so
 *
 * 64 and 500 are legacy's limits, and they are enforced on the way in rather than at submit. The
 * counter is the only thing that tells a reader why their typing stopped, so it is not decoration.
 * A **paste** past the limit lands truncated instead of being dropped whole — see the hook.
 *
 * ## The fee notice is a **brand-tinted block**, not the DS info alert
 *
 * It shipped as `Alert status="info"` on the reasoning that the DS already had the shape. It does
 * not: that component is the neutral information card — `--background-surface`, an inset ring, a
 * shadow and an **indigo** glyph — and it measured `#ffffff` / `#007aff` against a design that is
 * purple throughout. Right component for "here is a fact about your account", wrong one for a
 * brand-tinted panel.
 *
 * It now wears `BRAND_NOTICE`, the same pair as the analytics banner on the screen before it, so the
 * two tinted blocks in this feature are visibly one kind of object. Legacy paints them `#EEE8F9` and
 * `#F9F7FD` — two hard-coded hexes differing by nothing a reader could name, and both light-only.
 *
 * **15% is hard-coded**, as legacy hard-codes it, and it is deliberately *not*
 * `features/membership`'s `membership-fee.ts` — that is the buyer's 5.9% + $0.30 card fee, and this
 * is the seller's revenue share. Two numbers about two sides of one transaction; folding them into
 * one constant would be a pricing bug. **B103** asks whether 15 is still the rate and whether it is
 * served anywhere.
 *
 * ## Save is held for three different reasons, and the form says which
 *
 * An empty name, a save in flight, and a **price that has to be chosen again** — the last one being
 * the case legacy silently mishandles by resetting the slider to the cheapest rung (see the hook).
 */
export function MembershipSetupForm({
    form,
    className,
}: {
    form: MembershipTierFormState
    className?: string
}) {
    const { t } = useTranslation()
    const nameId = useId()
    const descriptionId = useId()

    return (
        <form
            className={cn('flex flex-1 flex-col gap-4', className)}
            onSubmit={event => {
                event.preventDefault()
                void form.submit()
            }}
        >
            <section className="flex flex-col gap-1">
                <FieldLabel
                    id={nameId}
                    className="px-0"
                    data={`${form.name.length}/${form.nameMax}`}
                >
                    {t('monetization_membership_name_label')}
                </FieldLabel>
                <input
                    data-testid="monetization-membership-name"
                    aria-labelledby={nameId}
                    value={form.name}
                    onChange={event => form.setName(event.target.value)}
                    placeholder={t('monetization_membership_name_placeholder')}
                    maxLength={form.nameMax}
                    className={cn(
                        'h-12 px-3',
                        'type-dense-default w-full rounded-xl border border-(--input-border) bg-(--input-bg)',
                        'text-(--input-text) placeholder:text-(--input-placeholder)',
                        'transition-colors hover:not-focus:border-(--input-border-hover)',
                        'outline-none focus-visible:border-(--input-border-focus)',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                />
            </section>

            {/*
             * Legacy's own geometry: a 12px inset, and a **rule** between the header and the ladder
             * (`Box sx={{ bgcolor: '#F4F4F4', height: '1px' }}`). The rule is what makes the card read
             * as a labelled control rather than as three stacked lines, and it was missing.
             * `--separator-default` rather than legacy's hex, so it flips with the theme.
             */}
            <section className="flex flex-col rounded-xl border border-(--separator-default) bg-(--background-surface)">
                <div className="flex flex-col gap-0.5 border-(--separator-default) border-b p-3">
                    <span className="type-dense-strong text-(--text-title)">
                        {t('monetization_membership_price_label')}
                    </span>
                    <span className="type-dense-default text-(--text-body)">
                        {t('monetization_membership_price_hint')}
                    </span>
                </div>
                {/*
                 * Legacy's own inset for the slider area — `padding: {xs: '10px 30px', md: '12px
                 * 48px'}` — and it is not decoration: the labels are centred on the track's ends, so
                 * the first and last need room to sit half outside it without clipping.
                 */}
                <PriceLadder
                    className="px-[30px] py-2.5 md:px-12 md:py-3"
                    value={form.rung}
                    onChange={form.setRung}
                    label={t('monetization_membership_price_label')}
                />
                {form.priceNeedsReselect ? (
                    /*
                     * The state legacy cannot represent. Its slider snaps to rung 0 for a tier priced
                     * off the ladder, so Save silently lowers the price; here the reader is told, and
                     * Save waits.
                     */
                    <p
                        role="alert"
                        data-testid="monetization-membership-price-reselect"
                        className="type-dense-default m-0 px-3 pb-3 text-(--accents-warning-active)"
                    >
                        {t('monetization_membership_price_reselect')}
                    </p>
                ) : null}
            </section>

            <section className="flex flex-col gap-1">
                <FieldLabel
                    id={descriptionId}
                    className="px-0"
                    data={`${form.description.length}/${form.descriptionMax}`}
                >
                    {t('monetization_membership_description_label')}
                </FieldLabel>
                <textarea
                    data-testid="monetization-membership-description"
                    aria-labelledby={descriptionId}
                    value={form.description}
                    onChange={event => form.setDescription(event.target.value)}
                    placeholder={t('monetization_membership_description_placeholder')}
                    maxLength={form.descriptionMax}
                    rows={3}
                    className={cn(
                        'resize-y p-3',
                        'type-dense-default w-full rounded-xl border border-(--input-border) bg-(--input-bg)',
                        'text-(--input-text) placeholder:text-(--input-placeholder)',
                        'transition-colors hover:not-focus:border-(--input-border-hover)',
                        'outline-none focus-visible:border-(--input-border-focus)',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                />
            </section>

            <div
                data-testid="monetization-membership-fee"
                className={cn('flex items-start gap-2.5 p-3', BRAND_NOTICE)}
            >
                {/* The mark takes the brand ink; the sentence does not. See `BRAND_NOTICE`. */}
                <Icon
                    name="info-circle"
                    weight="filled"
                    size={20}
                    aria-hidden
                    className="mt-px flex-none text-(--text-brand)"
                />
                <p className="type-dense-default m-0 text-(--text-title)">
                    {t('monetization_membership_fee_notice', {
                        percent: MEMBERSHIP_SYSTEM_FEE_PERCENT,
                    })}
                </p>
            </div>

            {form.errorText ? (
                /*
                 * The API's own sentence, in the form and not in a toast — `docs/API_ERRORS.md`. It
                 * sits directly above Save because that is the control that produced it.
                 */
                <p
                    role="alert"
                    data-testid="monetization-membership-save-error"
                    className="type-dense-default m-0 text-(--accents-error-active)"
                >
                    {form.errorText}
                </p>
            ) : null}

            <Button
                type="submit"
                data-testid="monetization-membership-save"
                variant="accent"
                size="large"
                fullWidth
                disabled={!form.canSave}
                aria-busy={form.isSaving || undefined}
                /*
                 * **Bottom-pinned below `md`, in flow from `md`.**
                 *
                 * `mt-auto` inside the `flex-1` form pushes Save to the foot of the column, which is
                 * what a phone wants — the form is the whole screen there, so the primary action
                 * belongs where a thumb is, and legacy's own form ends the same way.
                 *
                 * From `md` the column is a 612px card in the middle of a wide page and that same
                 * `mt-auto` stranded the button at the bottom of the *viewport*, several hundred
                 * pixels under the last field, with nothing between them. `md:mt-0` puts it back
                 * where it belongs: directly after the thing it submits.
                 */
                className="mt-auto md:mt-0"
            >
                {/*
                 * `Loader` **inside** the button, which is what its own note asks for, and the label
                 * is passed to it rather than swapped out: the DS `Loader` announces the work, and
                 * keeping the word out of the visual swap stops the button resizing mid-press.
                 */}
                {form.isSaving ? <Loader label={t('common_save')} /> : t('common_save')}
            </Button>
        </form>
    )
}
