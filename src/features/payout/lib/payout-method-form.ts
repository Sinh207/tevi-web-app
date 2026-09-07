/**
 * What one payout method asks for, what counts as valid, and the body that gets posted — as pure
 * functions over the method the backend described.
 *
 * ## Why this is a table and not eight forms
 *
 * Legacy ships **eight** components for this: `formUSDT`, `formVaiWallet`, `formPayoneer`,
 * `formZelle`, `formStripe`, `formBankTransfer/generic`, `formBankTransfer/unitedStates/individual`,
 * `.../corporation`, plus `formGeneric` for anything else — ~1,800 lines, each with its own copy of
 * the billing-contact block, its own `disabled` memo, its own `handleFormInit`, and its own hand-built
 * `payout_detail`. The differences between them are: which fields, which labels, which of them is a
 * picker, and how the payload is spelled. All four of those are **data**, and three of them the
 * backend already sends (`config.form`).
 *
 * So the field list is derived here and one component renders it. That is what makes the awkward part
 * — the per-method payload spelling below — visible in one place instead of being an implementation
 * detail of eight files that nobody diffs against each other.
 *
 * ## The rules are legacy's, including the ones that look wrong
 *
 * Each divergence is marked at the line it happens on. There are exactly three, and the biggest is
 * Zelle: legacy submits an **empty** contact for it (see `payoutDetailBody`).
 *
 * Nothing in here touches React, so every rule is unit-testable — which is the point:
 * "does the US corporation form post `corp_ein`" is not a claim a rendered tree can make cheaply, and
 * getting it wrong means a creator's money goes to a config the backend rejected or, worse, accepted
 * with a blank field.
 */
import type {
    PayoutConfigCreation,
    PayoutFormChoice,
    PayoutMethodOption,
} from '../api/config-types'

/**
 * How a field is entered.
 *
 * - `text` — free text.
 * - `digits` — keystrokes are filtered to `0-9`. **Schema-driven fields only**; see `DIGIT_FIELDS`.
 * - `email` — free text, validated as an address.
 * - `choice` — picked from `choices`, never typed.
 */
export type PayoutFieldKind = 'text' | 'digits' | 'email' | 'choice'

/** One control on the form. */
export interface PayoutFieldSpec {
    /** The wire key. Also the key in `PayoutFormValues`. */
    field: string
    kind: PayoutFieldKind
    /** A translation key when this client knows the field; `undefined` ⇒ use `fallbackLabel`. */
    labelKey?: string
    /** The backend's own `display_name`, or the humanised key when it sent none. */
    fallbackLabel: string
    choices: PayoutFormChoice[]
}

/** The two tabs the US bank-transfer form has, and nothing else has. */
export type PayoutBankVariant = 'individual' | 'corporation'

/** What a screen needs to render one method's form. */
export interface PayoutFormShape {
    /**
     * `stripe` means **there is no form**: the details are entered on Stripe's own hosted pages, and
     * the only control here is a button that fetches the onboarding link.
     */
    kind: 'fields' | 'stripe'
    fields: PayoutFieldSpec[]
    /** `true` only for a US bank transfer — the Individual / Corporation switch. */
    hasVariants: boolean
}

/** Every value the form holds, including the two contact fields. Keys are wire keys. */
export type PayoutFormValues = Record<string, string>

/** What is wrong with one field. Mapped to a sentence by the component that has the label. */
export type PayoutFieldProblem = 'required' | 'invalid-email' | 'invalid-address' | 'only-numbers'

export type PayoutFormErrors = Record<string, PayoutFieldProblem>

/*
 * The methods with a **hand-written field list** are the cases of the `switch` in `payoutFormShape`:
 * `usdt`, `vai_wallet`, `payoneer`, `zelle`, `bank_transfer`, `stripe`. Legacy ships a dedicated
 * component for each because the two do not always agree with `config.form` — Zelle's form asks for
 * `email_phone_number` while its schema lists `email`, and the US bank transfer splits one schema into
 * two tabs.
 *
 * Anything else is rendered from `config.form` as the backend sent it (the `default` branch), which is
 * legacy's `formGeneric`. **That is the path a method added after this client ships takes**, so it has
 * to be the one that needs no code: a new e-wallet in Indonesia appears with its own fields and its own
 * labels the day the backend adds it.
 *
 * There is deliberately no `Set` of those slugs any more. It existed, with a `hasDedicatedPayoutForm`
 * accessor, and nothing outside a test ever read either — a second list of the same six strings that
 * could fall out of step with the `switch` it described.
 */

/**
 * Schema-driven fields that only accept digits — legacy's `PAYOUT_NUMERIC_FIELDS`, and it applies to
 * the **generic** form only, exactly as legacy does.
 *
 * That restraint is deliberate rather than an omission: a US ZIP is typed `10001` but a Canadian one
 * is `K1A 0B1`, an SSN is usually typed with dashes, and legacy's dedicated forms accept all of that.
 * Filtering keystrokes on those fields would make a valid value untypeable — a much worse failure than
 * a stray space the backend trims.
 */
const DIGIT_FIELDS = new Set(['phone_number', 'account_number', 'bank_routing_number', 'zipcode'])

/**
 * The translation key for each field this client knows.
 *
 * These are the **`payout_config_*`** keys — the same ones the read-back screens use
 * (`payout-config-labels.ts`), which is deliberate: a field a creator entered as "Account number"
 * must not read back as something else. Two form-only keys exist for fields no read-back screen
 * prints.
 */
const FIELD_LABELS: Record<string, string> = {
    wallet_address: 'payout_config_wallet_address',
    network: 'payout_config_network',
    holder_name: 'payout_form_holder_name',
    account_number: 'payout_config_account_number',
    bank: 'payout_config_bank_name',
    bank_name: 'payout_config_bank_name',
    bank_routing_number: 'payout_config_bank_routing',
    individual_ssn: 'payout_config_individual_ssn',
    corp_ein: 'payout_config_corporate_ein',
    corp_name: 'payout_config_corporate_name',
    zipcode: 'payout_config_zipcode',
    email: 'payout_config_email',
    email_phone_number: 'payout_config_email_or_phone',
    phone_number: 'payout_form_phone_number',
    wallet_name: 'payout_form_wallet_name',
    contact_name: 'payout_form_contact_name',
    contact_email: 'payout_form_contact_email',
}

/**
 * `wallet_address` → "Address" for USDT · `holder_name` → "Account name" for a bank transfer.
 *
 * Both are legacy's own wording, per form, and both matter: the USDT screen says Address because that
 * is what a block explorer calls it, and a bank asks for the *account* name rather than a holder name.
 */
export function payoutFieldLabelKey(field: string, methodSlug: string): string | undefined {
    const slug = methodSlug.toLowerCase()
    if (field === 'wallet_address' && slug === 'usdt') return 'payout_config_address'
    if (field === 'holder_name' && slug === 'bank_transfer') return 'payout_config_account_name'
    return FIELD_LABELS[field]
}

/** `bank_routing_number` → `bank routing number`, for a field the backend named and did not label. */
function humanise(field: string): string {
    return field.replace(/_/g, ' ')
}

/** The `choices` the backend sent for one field, or `[]`. */
function choicesFor(method: PayoutMethodOption, field: string): PayoutFormChoice[] {
    return method.form.find(entry => entry.field === field)?.choices ?? []
}

function spec(
    method: PayoutMethodOption,
    field: string,
    kind: PayoutFieldKind,
    choiceField = field,
): PayoutFieldSpec {
    const choices = choicesFor(method, choiceField)
    return {
        field,
        /*
         * A `choice` field with nothing to choose from degrades to free text rather than rendering an
         * empty picker. `choices` is absent from the published schema (see `api/config-types.ts`), so
         * "the backend stopped sending it" is a live possibility — and a dead dropdown is a form that
         * cannot be submitted at all, where a text field still lets a creator type their bank's name.
         */
        kind: kind === 'choice' && choices.length === 0 ? 'text' : kind,
        labelKey: payoutFieldLabelKey(field, method.slug),
        fallbackLabel:
            method.form.find(entry => entry.field === choiceField)?.displayName || humanise(field),
        choices,
    }
}

/**
 * The fields one method asks for, in legacy's order.
 *
 * `countryCode` decides the bank-transfer shape — `US` gets the two-tab form with an SSN or an EIN,
 * everybody else gets bank name / number / holder. That is legacy's `formBankTransfer/index.js`, and
 * the test in this folder pins both arms.
 */
export function payoutFormShape(
    method: PayoutMethodOption,
    countryCode: string,
    variant: PayoutBankVariant = 'individual',
): PayoutFormShape {
    const slug = method.slug.toLowerCase()
    const isUs = countryCode.toUpperCase() === 'US'

    switch (slug) {
        case 'stripe':
            return { kind: 'stripe', fields: [], hasVariants: false }

        case 'usdt':
            return {
                kind: 'fields',
                fields: [spec(method, 'wallet_address', 'text'), spec(method, 'network', 'choice')],
                hasVariants: false,
            }

        case 'vai_wallet':
            return {
                kind: 'fields',
                fields: [spec(method, 'wallet_address', 'text')],
                hasVariants: false,
            }

        case 'payoneer':
            return {
                kind: 'fields',
                fields: [spec(method, 'holder_name', 'text'), spec(method, 'email', 'email')],
                hasVariants: false,
            }

        case 'zelle':
            return {
                kind: 'fields',
                fields: [
                    spec(method, 'holder_name', 'text'),
                    spec(method, 'email_phone_number', 'text'),
                ],
                hasVariants: false,
            }

        case 'bank_transfer':
            if (!isUs) {
                return {
                    kind: 'fields',
                    fields: [
                        /*
                         * The **picker** is over `config.form`'s `bank` choices while the value is
                         * submitted as `bank_name` — legacy's own arrangement, which is why `spec`
                         * takes a separate `choiceField`. See `payoutDetailBody` for what that costs.
                         */
                        spec(method, 'bank_name', 'choice', 'bank'),
                        spec(method, 'account_number', 'text'),
                        spec(method, 'holder_name', 'text'),
                    ],
                    hasVariants: false,
                }
            }
            return {
                kind: 'fields',
                fields:
                    variant === 'corporation'
                        ? [
                              spec(method, 'corp_ein', 'text'),
                              spec(method, 'corp_name', 'text'),
                              spec(method, 'account_number', 'text'),
                              spec(method, 'bank_routing_number', 'text'),
                              /*
                               * Legacy renders the ZIP inside its *Billing contact* block, next to the
                               * contact name and email. It is posted in `payout_detail` with the bank
                               * fields, so it is one of them: the bank's own address, not a way to
                               * reach the creator. Grouped where it belongs, which is the only
                               * cosmetic divergence on this form.
                               */
                              spec(method, 'zipcode', 'text'),
                          ]
                        : [
                              spec(method, 'individual_ssn', 'text'),
                              spec(method, 'account_number', 'text'),
                              spec(method, 'holder_name', 'text'),
                              spec(method, 'bank_routing_number', 'text'),
                              spec(method, 'zipcode', 'text'),
                          ],
                hasVariants: true,
            }

        default:
            /*
             * The schema-driven path — legacy's `formGeneric`. Every field the backend listed, in its
             * order, labelled by its own `display_name` where this client has no key, a picker where
             * it sent choices, and digits-only where legacy restricts them.
             */
            return {
                kind: 'fields',
                fields: method.form.map(entry =>
                    spec(
                        method,
                        entry.field,
                        entry.choices.length > 0
                            ? 'choice'
                            : DIGIT_FIELDS.has(entry.field)
                              ? 'digits'
                              : entry.field === 'email'
                                ? 'email'
                                : 'text',
                    ),
                ),
                hasVariants: false,
            }
    }
}

/**
 * The fields the backend asked for that a hand-written shape does not collect, and the other way
 * round — in the console, in development only.
 *
 * The six dedicated shapes ignore `config.form` and list their fields in code, which is legacy's
 * arrangement and is what lets Zelle ask for `email_phone_number` while its schema says `email`. The
 * cost is that a field the **backoffice adds** to one of those methods is silently not collected, and
 * the only symptom is a `400` on submit with a message about a field the reader never saw. This turns
 * that into a line naming it.
 *
 * Not a runtime behaviour change and deliberately not a thrown error: the backend is the authority on
 * its own form, but a client that guessed wrong must still let somebody get paid by the fields it does
 * know. Called once per method selection, not per render.
 */
export function reportPayoutFormDrift(
    method: PayoutMethodOption,
    countryCode: string,
    variant?: PayoutBankVariant,
): void {
    if (process.env.NODE_ENV === 'production') return
    const shape = payoutFormShape(method, countryCode, variant)
    // Nothing to compare: the schema-driven path *is* `config.form`, and Stripe collects nothing.
    if (shape.kind !== 'fields' || method.form.length === 0) return

    const asked = new Set(method.form.map(entry => entry.field))
    /*
     * The **union of both tabs** for a method that has them: the US bank transfer splits one schema
     * into Individual and Corporation, so comparing against one of them would report the other's
     * fields (`corp_ein`, `corp_name` or `individual_ssn`) as uncollected on every selection — a
     * warning that is always wrong is a warning nobody reads.
     */
    const collected = new Set(
        shape.hasVariants
            ? [
                  ...payoutFormShape(method, countryCode, 'individual').fields,
                  ...payoutFormShape(method, countryCode, 'corporation').fields,
              ].map(field => field.field)
            : shape.fields.map(field => field.field),
    )
    /*
     * `bank` is expected on both sides of this: the picker reads `config.form`'s `bank` choices and
     * submits the chosen *name* as `bank_name`, which is legacy's own arrangement (see
     * `payoutDetailBody`). Listing it every time would train whoever reads this to ignore the warning.
     */
    const EXPECTED_GAPS = new Set(['bank', 'bank_name'])

    const missing = [...asked].filter(field => !collected.has(field) && !EXPECTED_GAPS.has(field))
    const extra = [...collected].filter(field => !asked.has(field) && !EXPECTED_GAPS.has(field))
    if (missing.length === 0 && extra.length === 0) return

    console.warn('[payout] this method’s form does not match what the backend asked for', {
        method: method.slug,
        country: countryCode,
        ...(missing.length > 0 ? { askedForButNotCollected: missing } : {}),
        ...(extra.length > 0 ? { collectedButNotAsked: extra } : {}),
    })
}

/**
 * A pragmatic address check, not a validator.
 *
 * Legacy's regex, unchanged: `0x` and 40 hex digits. It is right for the EVM networks USDT is offered
 * on and wrong for TRON (`T…`, base58) — but the *networks* come from the backend, so if a non-EVM one
 * is ever added this rejects a valid address. Left as legacy has it rather than loosened, because the
 * failure mode of loosening it is a typo'd address that the chain accepts and nobody can recover
 * from. **B89** asks the backend to state the per-network format.
 */
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/

/** Legacy's own email test, character for character. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DIGITS_ONLY = /^\d+$/

/**
 * Everything wrong with the form, keyed by field. Empty ⇒ submittable.
 *
 * ## Every field is required, and that is not stricter than legacy
 *
 * Legacy validates *some* fields per method and then disables its submit button whenever **any** value
 * is empty (`Object.values(formData).some(data => !data)` — in all eight forms). So a blank field
 * already blocked submission; what it did not do was say *which* one. This returns the reason per
 * field, which is the same gate with the answer attached.
 *
 * The format rules are legacy's per-method ones: the USDT address pattern, an email test on anything
 * that is an address, digits on the schema-driven numeric fields.
 */
export function validatePayoutForm({
    method,
    countryCode,
    variant,
    values,
}: {
    method: PayoutMethodOption
    countryCode: string
    variant?: PayoutBankVariant
    values: PayoutFormValues
}): PayoutFormErrors {
    const errors: PayoutFormErrors = {}
    const shape = payoutFormShape(method, countryCode, variant)

    // Stripe has no form, so there is nothing to be wrong: the button is the whole control.
    if (shape.kind === 'stripe') return errors

    const contactEmail = (values.contact_email ?? '').trim()
    if (!contactEmail) errors.contact_email = 'required'
    else if (!EMAIL.test(contactEmail)) errors.contact_email = 'invalid-email'

    if (!(values.contact_name ?? '').trim()) errors.contact_name = 'required'

    for (const field of shape.fields) {
        const value = (values[field.field] ?? '').trim()
        if (!value) {
            errors[field.field] = 'required'
            continue
        }
        if (field.kind === 'email' && !EMAIL.test(value)) {
            errors[field.field] = 'invalid-email'
            continue
        }
        if (field.kind === 'digits' && !DIGITS_ONLY.test(value)) {
            errors[field.field] = 'only-numbers'
            continue
        }
        if (
            field.field === 'wallet_address' &&
            method.slug.toLowerCase() === 'usdt' &&
            !EVM_ADDRESS.test(value)
        ) {
            errors[field.field] = 'invalid-address'
        }
    }

    return errors
}

/**
 * The `payout_detail` bag, spelled the way each method's backend expects it.
 *
 * This is the one part that could not be derived, and it is where legacy's three oddities live. All
 * three are reproduced or diverged from **deliberately**:
 *
 * 1. **Payoneer sends the email three times** — `email`, `phone_number` and `email_phone_number` all
 *    carry the address. Reproduced: the backend has accepted exactly this payload in production for
 *    years, and which of the three it actually reads is not something this client can find out by
 *    guessing. **B89.**
 * 2. **Zelle sends an empty contact.** Legacy's Zelle form collects `email_phone_number` and then
 *    posts `email: formData?.email` — a key its own form never sets — into all three of those fields.
 *    The value is `undefined`, so it posts `''`: a saved Zelle method with **no way to pay it**.
 *    *Diverged:* the typed value is posted, in the same three keys Payoneer uses. This is a bug fix,
 *    not a redesign, and it is the one place this file does not match `web-app`.
 * 3. **The non-US bank transfer's `bank`.** Legacy picks from `config.form`'s `bank` choices, stores
 *    the choice's *name* in `bank_name`, and posts `bank: formData?.bank || ''` — always the empty
 *    string, because nothing ever writes `bank`. Reproduced, empty string included: that is the
 *    payload the backend accepts today, and posting the choice's id instead would be inventing a
 *    contract on the screen that moves money. **B89** asks whether `bank` should carry the id.
 */
export function payoutDetailBody({
    method,
    countryCode,
    variant = 'individual',
    values,
}: {
    method: PayoutMethodOption
    countryCode: string
    variant?: PayoutBankVariant
    values: PayoutFormValues
}): Record<string, string> {
    const slug = method.slug.toLowerCase()
    const read = (field: string) => (values[field] ?? '').trim()

    switch (slug) {
        case 'usdt':
            return { wallet_address: read('wallet_address'), network: read('network') }

        case 'vai_wallet':
            return { wallet_address: read('wallet_address') }

        case 'payoneer': {
            // Oddity 1 — the same address in three keys, as legacy posts it.
            const email = read('email')
            return {
                email,
                holder_name: read('holder_name'),
                phone_number: email,
                email_phone_number: email,
            }
        }

        case 'zelle': {
            // Oddity 2 — the typed value, where legacy posts an empty string.
            const contact = read('email_phone_number')
            return {
                holder_name: read('holder_name'),
                email: contact,
                email_phone_number: contact,
                phone_number: contact,
            }
        }

        case 'bank_transfer':
            if (countryCode.toUpperCase() !== 'US') {
                return {
                    // Oddity 3 — legacy's always-empty `bank`, kept.
                    bank: read('bank'),
                    bank_name: read('bank_name'),
                    account_number: read('account_number'),
                    holder_name: read('holder_name'),
                }
            }
            return variant === 'corporation'
                ? {
                      corp_ein: read('corp_ein'),
                      corp_name: read('corp_name'),
                      account_number: read('account_number'),
                      bank_routing_number: read('bank_routing_number'),
                      zipcode: read('zipcode'),
                  }
                : {
                      individual_ssn: read('individual_ssn'),
                      account_number: read('account_number'),
                      holder_name: read('holder_name'),
                      bank_routing_number: read('bank_routing_number'),
                      zipcode: read('zipcode'),
                  }

        default: {
            /*
             * The schema-driven payload: exactly the fields the backend asked for, and only those. A
             * value the form does not have is posted as `''` rather than omitted, which is legacy's
             * `formData[field.field] || ''` — the backend's serializer requires the key.
             */
            const out: Record<string, string> = {}
            for (const entry of method.form) out[entry.field] = read(entry.field)
            return out
        }
    }
}

/** The whole request body — the detail bag plus the method and the billing contact. */
export function payoutConfigBody({
    method,
    countryCode,
    variant,
    values,
}: {
    method: PayoutMethodOption
    countryCode: string
    variant?: PayoutBankVariant
    values: PayoutFormValues
}): PayoutConfigCreation {
    return {
        payout_method_id: method.id,
        payout_detail: payoutDetailBody({ method, countryCode, variant, values }),
        contact_name: (values.contact_name ?? '').trim(),
        contact_email: (values.contact_email ?? '').trim(),
    }
}

/**
 * The form's starting values — the contact prefilled from the account, **everything else blank**.
 *
 * ## No choice is preselected, and that is a deliberate divergence
 *
 * Legacy preselects the first option of every `choices` field (`networks?.[0]?.name`, and
 * `field.choices?.[0]?.name` in its generic form). Reproduced at first, then removed, because of what
 * the field means:
 *
 * - **A USDT network is the chain the money is sent on.** Preselected ERC20 against a deposit address
 *   that only exists on BEP20 is not a rejected payout, it is **funds gone** — no support ticket
 *   recovers a transfer on the wrong chain. Legacy makes that the default answer to a question it
 *   never asked.
 * - **A wallet or a bank is the destination.** The first row of an alphabetical list of 54 banks is not
 *   anybody's bank; DANA is not everybody's e-wallet. Legacy's own bank picker starts empty, so it
 *   already disagrees with itself here.
 *
 * The cost is one tap. What it buys is that every irreversible field on this form was **chosen**, and
 * `canSubmit` enforces it: an untouched picker keeps the button disabled rather than posting a guess.
 * Whether the backend rejects an address/network mismatch is **B89**; until it answers, the client
 * must not supply the answer itself.
 */
export function initialPayoutFormValues({
    method,
    countryCode,
    variant,
    contactName,
    contactEmail,
}: {
    method: PayoutMethodOption
    countryCode: string
    variant?: PayoutBankVariant
    contactName: string
    contactEmail: string
}): PayoutFormValues {
    const shape = payoutFormShape(method, countryCode, variant)
    const values: PayoutFormValues = {
        contact_name: contactName,
        contact_email: contactEmail,
    }
    for (const field of shape.fields) values[field.field] = ''
    return values
}
