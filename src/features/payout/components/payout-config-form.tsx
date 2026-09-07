'use client'

import { TextField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import Image from 'next/image'
import type { PayoutMethodOption } from '../api/config-types'
import type { UseSetupPayoutsResult } from '../hooks/use-setup-payouts'
import { PAYOUT_ART } from '../lib/illustrations'
import type { PayoutFieldProblem, PayoutFieldSpec } from '../lib/payout-method-form'
import { PayoutPickerField } from './payout-picker-field'
import { PayoutTermsNote } from './payout-terms-note'

/**
 * One payout method's form — every method, from the field list `lib/payout-method-form.ts` derives.
 *
 * Legacy has eight components here (`formUSDT`, `formZelle`, `formBankTransfer/unitedStates/...`, …),
 * each repeating the billing-contact block, the submit gate and the terms line. The differences
 * between them are data, so they live in the table and this renders it: a text field, a picker where
 * the backend sent choices, the two US tabs, and the contact.
 *
 * That is also what makes a **new** method free. A payout option the backend adds next quarter arrives
 * with its own `config.form` and renders here with its own labels, where legacy would show
 * `formGeneric`'s untranslated fallback until somebody shipped a component for it.
 */

/** The sentence for one field problem. The label is the caller's — the validator does not know it. */
function problemMessage(
    problem: PayoutFieldProblem | undefined,
    label: string,
    t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
    switch (problem) {
        case 'required':
            return t('payout_form_required', { label })
        case 'invalid-email':
            return t('payout_form_invalid_email')
        case 'invalid-address':
            return t('payout_form_invalid_address')
        case 'only-numbers':
            return t('payout_form_only_numbers')
        default:
            return null
    }
}

/** A choice's mark, 20px — the size legacy renders a bank or network logo at inside its menu. */
function ChoiceMark({ logo, name }: { logo: string; name: string }) {
    if (!logo) return null
    return (
        <Image
            src={logo}
            alt=""
            width={20}
            height={20}
            className="size-5 flex-none rounded-sm object-contain"
            aria-label={name}
        />
    )
}

function PayoutField({ spec, setup }: { spec: PayoutFieldSpec; setup: UseSetupPayoutsResult }) {
    const { t } = useTranslation()
    const label = spec.labelKey ? t(spec.labelKey) : spec.fallbackLabel
    const error = problemMessage(setup.errors[spec.field], label, t)
    const value = setup.values[spec.field] ?? ''

    if (spec.kind === 'choice') {
        return (
            <PayoutPickerField
                /*
                 * One id for every field on this form, with the wire key in a companion attribute:
                 * the two US bank variants share three field names, so putting the field *into* the
                 * id would collide across tabs. Written as a literal at both control sites rather
                 * than through a local const — `scripts/build-testid-catalog.mjs` scans for
                 * `data-testid="…"`, so a const is an id the catalog cannot see and the e2e guard
                 * then reports the spec as locating something that does not exist.
                 */
                testId="payout-setup-field"
                fieldKey={spec.field}
                label={label}
                dialogTitle={t('payout_setup_choose', { label })}
                placeholder={t('payout_setup_select', { label })}
                value={value}
                error={error}
                disabled={setup.isSubmitting}
                options={spec.choices.map(choice => ({
                    value: choice.name,
                    label: choice.name,
                    mark: <ChoiceMark logo={choice.logo} name={choice.name} />,
                }))}
                onSelect={next => setup.setValue(spec.field, next)}
            />
        )
    }

    return (
        <TextField
            data-testid="payout-setup-field"
            data-field-key={spec.field}
            label={label}
            placeholder={label}
            value={value}
            error={error}
            disabled={setup.isSubmitting}
            /*
             * `inputMode` and nothing else for a digits field: the keystroke filter is applied in
             * `onChange` below, because `type="number"` brings a spinner, drops leading zeros — fatal
             * for an account number — and lets `e`, `+` and `-` through anyway.
             */
            inputMode={
                spec.kind === 'digits' ? 'numeric' : spec.kind === 'email' ? 'email' : 'text'
            }
            autoComplete={spec.kind === 'email' ? 'email' : 'off'}
            onChange={event => {
                const next = event.target.value
                setup.setValue(spec.field, spec.kind === 'digits' ? next.replace(/\D/g, '') : next)
            }}
        />
    )
}

/** The Individual / Corporation switch — US bank transfer only. */
function VariantTabs({ setup }: { setup: UseSetupPayoutsResult }) {
    const { t } = useTranslation()

    return (
        <SegmentedControl aria-label={t('payout_setup_account_type')}>
            {(['individual', 'corporation'] as const).map(option => (
                <SegmentedControlItem
                    data-testid="payout-setup-variant"
                    data-option-value={option}
                    key={option}
                    selected={setup.variant === option}
                    disabled={setup.isSubmitting}
                    onClick={() => setup.setVariant(option)}
                >
                    <SegmentedControlItemLabel>
                        {option === 'individual'
                            ? t('payout_setup_individual')
                            : t('payout_setup_corporation')}
                    </SegmentedControlItemLabel>
                </SegmentedControlItem>
            ))}
        </SegmentedControl>
    )
}

/**
 * Stripe's whole form: a button.
 *
 * The account details are entered on Stripe's own hosted onboarding, so there is nothing to collect
 * here and no billing contact to ask for — `payout-configs/` is never posted on this path at all.
 * The reader leaves for Stripe and comes back to `/my-wallet/payout-method`.
 */
function StripePanel({ setup }: { setup: UseSetupPayoutsResult }) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-3 p-4">
            <p className="type-dense-default m-0 text-(--text-body)">
                {t('payout_setup_stripe_body')}
            </p>
            <Button
                data-testid="payout-setup-stripe"
                variant="accent"
                size="large"
                disabled={setup.isStartingStripe}
                onClick={setup.startStripe}
                className="w-full"
            >
                {t('common_continue')}
            </Button>
            {/*
             * Its own id, distinct from the field form's below: both notes are the same component but
             * only one of them is on screen at a time, and a locator that matches either would find
             * whichever the DOM happened to render first.
             */}
            <PayoutTermsNote testId="payout-stripe-terms" />
        </div>
    )
}

/**
 * The VAI Wallet promo under the VAI form — legacy's card, which is how a creator without a VAI wallet
 * gets one.
 *
 * A real link with `rel="noopener noreferrer"`, where legacy uses `onClick` + `window.open`: this goes
 * to another origin, so it should be middle-clickable and must not hand that origin a `window.opener`.
 */
function VaiWalletPromo() {
    const { t } = useTranslation()

    return (
        <a
            data-testid="payout-setup-vai-wallet"
            href="https://app.vaiwallet.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col overflow-clip rounded-xl bg-(--background-surface) shadow-sm transition-shadow hover:shadow-md"
        >
            <Image
                src={PAYOUT_ART.vaiWalletBanner.src}
                alt=""
                width={PAYOUT_ART.vaiWalletBanner.width}
                height={PAYOUT_ART.vaiWalletBanner.height}
                className="h-[194px] w-full object-cover"
            />
            <span className="flex items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 flex-col">
                    <span className="type-body-strong text-(--text-title)">
                        {t('payout_setup_vai_title')}
                    </span>
                    <span className="type-caption-meta text-(--text-subtitle)">
                        {t('payout_setup_vai_body')}
                    </span>
                </span>
                {/*
                 * Legacy's black 40px disc. Painted from the **Button/primary** pair rather than a
                 * raw colour — `--button-primary-bg` is Zinc 950, which is the ramp that inverts, so
                 * the disc stays dark-on-light and light-on-dark without a second declaration. Not an
                 * actual `Button`: this whole card is one `<a>`, and a button inside an anchor is
                 * invalid markup with two competing activation behaviours.
                 */}
                <span className="flex size-10 flex-none items-center justify-center rounded-full bg-(--button-primary-bg) text-(--button-primary-text)">
                    {/* `aria-hidden` — the card's own text is the link's name. */}
                    <Icon name="arrow-right" size={20} aria-hidden />
                </span>
            </span>
        </a>
    )
}

export function PayoutConfigForm({
    method,
    setup,
    className,
}: {
    method: PayoutMethodOption
    setup: UseSetupPayoutsResult
    className?: string
}) {
    const { t } = useTranslation()
    const shape = setup.shape

    if (!shape) return null
    if (shape.kind === 'stripe') return <StripePanel setup={setup} />

    const contactNameError = problemMessage(
        setup.errors.contact_name,
        t('payout_form_contact_name'),
        t,
    )
    const contactEmailError = problemMessage(
        setup.errors.contact_email,
        t('payout_form_contact_email'),
        t,
    )

    return (
        <form
            data-testid="payout-setup-form"
            className={cn('flex flex-col gap-4 p-4', className)}
            onSubmit={event => {
                event.preventDefault()
                setup.submit()
            }}
        >
            {shape.hasVariants && <VariantTabs setup={setup} />}

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
                <legend className="type-dense-strong mb-1 text-(--text-title)">
                    {t('payout_setup_account_information')}
                </legend>
                {shape.fields.map(field => (
                    <PayoutField
                        // The **variant** is in the key as well as the field: Individual and
                        // Corporation share `account_number`, `bank_routing_number` and `zipcode`, so
                        // without it React reuses the mounted input across a tab press and the field
                        // keeps whatever the other tab's controlled value was for one render.
                        key={`${setup.variant}-${field.field}`}
                        spec={field}
                        setup={setup}
                    />
                ))}
            </fieldset>

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
                <legend className="type-dense-strong mb-1 text-(--text-title)">
                    {t('payout_setup_billing_contact')}
                </legend>
                <TextField
                    data-testid="payout-setup-contact-email"
                    label={t('payout_form_contact_email')}
                    placeholder={t('payout_form_contact_email')}
                    type="email"
                    autoComplete="email"
                    /*
                     * The serializer's own caps (`PayoutConfigSerializerV5`: `contact_email` 254,
                     * `contact_name` 100). Stated here so a paste that is too long is refused by the
                     * field rather than by a 400 the reader has to interpret — and so the browser's
                     * own counter matches what the backend will take.
                     */
                    maxLength={254}
                    value={setup.values.contact_email ?? ''}
                    error={contactEmailError}
                    disabled={setup.isSubmitting}
                    onChange={event => setup.setValue('contact_email', event.target.value)}
                />
                <TextField
                    data-testid="payout-setup-contact-name"
                    label={t('payout_form_contact_name')}
                    placeholder={t('payout_form_contact_name')}
                    autoComplete="name"
                    // 100, per the serializer — see the note on the email above.
                    maxLength={100}
                    value={setup.values.contact_name ?? ''}
                    error={contactNameError}
                    disabled={setup.isSubmitting}
                    onChange={event => setup.setValue('contact_name', event.target.value)}
                />
            </fieldset>

            <div className="flex flex-col gap-2">
                <Button
                    data-testid="payout-setup-submit"
                    type="submit"
                    variant="accent"
                    size="large"
                    /*
                     * Legacy's gate — every field filled and nothing known to be wrong (`canSubmit`) —
                     * *plus* the in-flight guard. The validator still runs on press: `canSubmit` only
                     * knows about emptiness, and a malformed wallet address has to produce a message
                     * rather than a silently dead button.
                     */
                    disabled={!setup.canSubmit || setup.isSubmitting}
                    className="w-full"
                >
                    {setup.isSubmitting ? t('payout_setup_adding') : t('payout_setup_add_method')}
                </Button>
                <PayoutTermsNote testId="payout-setup-terms" />
            </div>

            {method.slug === 'vai_wallet' && <VaiWalletPromo />}
        </form>
    )
}
