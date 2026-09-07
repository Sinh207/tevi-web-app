import { describe, expect, it, vi } from 'vitest'
import type { PayoutMethodOption } from '../api/config-types'
import {
    initialPayoutFormValues,
    payoutConfigBody,
    payoutDetailBody,
    payoutFieldLabelKey,
    payoutFormShape,
    reportPayoutFormDrift,
    validatePayoutForm,
} from './payout-method-form'

/**
 * The payload rules, pinned.
 *
 * Every assertion here is a claim about **where somebody's money goes**: a form that posts
 * `corp_ein` under the wrong key, or an empty contact for Zelle, produces a saved payout method that
 * either 400s or — worse — succeeds and pays nobody. None of that is visible in a rendered tree
 * without a network, which is why the rules are pure functions and this file is the gate on them.
 */
function method(overrides: Partial<PayoutMethodOption> = {}): PayoutMethodOption {
    return {
        id: 'pm_1',
        name: 'Method',
        slug: 'generic_wallet',
        logo: '',
        currency: 'VND',
        countryName: 'Viet Nam',
        processingTimeNote: '',
        dailyLimit: null,
        minimumAmount: null,
        form: [],
        ...overrides,
    }
}

const CONTACT = { contact_name: 'Ada', contact_email: 'ada@tevi.com' }

describe('payoutFormShape', () => {
    it('gives Stripe no fields at all — the details are entered on Stripe', () => {
        const shape = payoutFormShape(method({ slug: 'stripe' }), 'US')
        expect(shape.kind).toBe('stripe')
        expect(shape.fields).toEqual([])
    })

    it('asks USDT for an address and a network picker', () => {
        const shape = payoutFormShape(
            method({
                slug: 'usdt',
                form: [
                    { field: 'wallet_address', displayName: 'Address', choices: [] },
                    {
                        field: 'network',
                        displayName: 'Network',
                        choices: [
                            { id: '1', name: 'ERC20', logo: '' },
                            { id: '2', name: 'BEP20', logo: '' },
                        ],
                    },
                ],
            }),
            'VN',
        )
        expect(shape.fields.map(field => [field.field, field.kind])).toEqual([
            ['wallet_address', 'text'],
            ['network', 'choice'],
        ])
    })

    it('degrades a picker with no choices to free text', () => {
        // `choices` is absent from the published schema, so this is a live possibility — and an empty
        // dropdown is a form that cannot be submitted at all.
        const shape = payoutFormShape(method({ slug: 'usdt' }), 'VN')
        expect(shape.fields.find(field => field.field === 'network')?.kind).toBe('text')
    })

    it('splits the US bank transfer into two variants and leaves the rest of the world alone', () => {
        const bank = method({ slug: 'bank_transfer' })

        const generic = payoutFormShape(bank, 'VN')
        expect(generic.hasVariants).toBe(false)
        expect(generic.fields.map(field => field.field)).toEqual([
            'bank_name',
            'account_number',
            'holder_name',
        ])

        const individual = payoutFormShape(bank, 'US', 'individual')
        expect(individual.hasVariants).toBe(true)
        expect(individual.fields.map(field => field.field)).toEqual([
            'individual_ssn',
            'account_number',
            'holder_name',
            'bank_routing_number',
            'zipcode',
        ])

        const corporation = payoutFormShape(bank, 'US', 'corporation')
        expect(corporation.fields.map(field => field.field)).toEqual([
            'corp_ein',
            'corp_name',
            'account_number',
            'bank_routing_number',
            'zipcode',
        ])
    })

    it('renders an unknown method from the schema, labels and all', () => {
        // The path a method added after this client ships takes — it must need no code.
        const shape = payoutFormShape(
            method({
                slug: 'gopay',
                form: [
                    { field: 'wallet_name', displayName: 'Wallet name', choices: [] },
                    { field: 'phone_number', displayName: 'Phone number', choices: [] },
                    { field: 'mystery', displayName: 'Mystery field', choices: [] },
                ],
            }),
            'ID',
        )
        expect(shape.fields.map(field => [field.field, field.kind])).toEqual([
            ['wallet_name', 'text'],
            // Digits-only, and only on the schema-driven path — see `DIGIT_FIELDS`.
            ['phone_number', 'digits'],
            ['mystery', 'text'],
        ])
        // A field this client has never heard of still gets the backend's own label.
        expect(shape.fields[2].labelKey).toBeUndefined()
        expect(shape.fields[2].fallbackLabel).toBe('Mystery field')
    })
})

describe('payoutFieldLabelKey', () => {
    it('calls a USDT wallet an address and a bank holder an account name', () => {
        expect(payoutFieldLabelKey('wallet_address', 'usdt')).toBe('payout_config_address')
        expect(payoutFieldLabelKey('wallet_address', 'vai_wallet')).toBe(
            'payout_config_wallet_address',
        )
        expect(payoutFieldLabelKey('holder_name', 'bank_transfer')).toBe(
            'payout_config_account_name',
        )
        expect(payoutFieldLabelKey('holder_name', 'payoneer')).toBe('payout_form_holder_name')
    })
})

describe('validatePayoutForm', () => {
    const usdt = method({
        slug: 'usdt',
        form: [
            { field: 'wallet_address', displayName: 'Address', choices: [] },
            {
                field: 'network',
                displayName: 'Network',
                choices: [{ id: '1', name: 'ERC20', logo: '' }],
            },
        ],
    })

    it('requires every field and names the one that is missing', () => {
        const errors = validatePayoutForm({
            method: usdt,
            countryCode: 'VN',
            values: { ...CONTACT, network: 'ERC20' },
        })
        expect(errors).toEqual({ wallet_address: 'required' })
    })

    it('rejects a wallet address that is not 0x + 40 hex', () => {
        const values = { ...CONTACT, network: 'ERC20', wallet_address: '0xdeadbeef' }
        expect(validatePayoutForm({ method: usdt, countryCode: 'VN', values })).toEqual({
            wallet_address: 'invalid-address',
        })

        const good = { ...values, wallet_address: `0x${'a'.repeat(40)}` }
        expect(validatePayoutForm({ method: usdt, countryCode: 'VN', values: good })).toEqual({})
    })

    it('checks the billing contact, and both halves of it', () => {
        const values = {
            contact_name: '',
            contact_email: 'not-an-email',
            network: 'ERC20',
            wallet_address: `0x${'b'.repeat(40)}`,
        }
        expect(validatePayoutForm({ method: usdt, countryCode: 'VN', values })).toEqual({
            contact_name: 'required',
            contact_email: 'invalid-email',
        })
    })

    it('holds digits-only fields to digits on the schema-driven path', () => {
        const gopay = method({
            slug: 'gopay',
            form: [{ field: 'phone_number', displayName: 'Phone number', choices: [] }],
        })
        expect(
            validatePayoutForm({
                method: gopay,
                countryCode: 'ID',
                values: { ...CONTACT, phone_number: '+62 812' },
            }),
        ).toEqual({ phone_number: 'only-numbers' })
    })

    it('has nothing to say about Stripe', () => {
        // No form, so no field can be wrong — the contact is not asked for either.
        expect(
            validatePayoutForm({
                method: method({ slug: 'stripe' }),
                countryCode: 'US',
                values: {},
            }),
        ).toEqual({})
    })

    it('does not treat whitespace as a value', () => {
        expect(
            validatePayoutForm({
                method: method({
                    slug: 'vai_wallet',
                    form: [{ field: 'wallet_address', displayName: 'Address', choices: [] }],
                }),
                countryCode: 'VN',
                values: { ...CONTACT, wallet_address: '   ' },
            }),
        ).toEqual({ wallet_address: 'required' })
    })
})

describe('payoutDetailBody', () => {
    it('posts a USDT wallet with its network', () => {
        expect(
            payoutDetailBody({
                method: method({ slug: 'usdt' }),
                countryCode: 'VN',
                values: { wallet_address: '0xabc', network: 'ERC20' },
            }),
        ).toEqual({ wallet_address: '0xabc', network: 'ERC20' })
    })

    it('repeats a Payoneer address in all three keys legacy sends', () => {
        expect(
            payoutDetailBody({
                method: method({ slug: 'payoneer' }),
                countryCode: 'VN',
                values: { holder_name: 'Ada', email: 'ada@tevi.com' },
            }),
        ).toEqual({
            email: 'ada@tevi.com',
            holder_name: 'Ada',
            phone_number: 'ada@tevi.com',
            email_phone_number: 'ada@tevi.com',
        })
    })

    it('posts the value Zelle asked for — legacy posts an empty string here', () => {
        /*
         * The one deliberate divergence from `web-app`: its Zelle form reads `formData.email`, a key
         * the form never sets, so it saves a Zelle method with no contact on it at all.
         */
        expect(
            payoutDetailBody({
                method: method({ slug: 'zelle' }),
                countryCode: 'US',
                values: { holder_name: 'Ada', email_phone_number: 'ada@tevi.com' },
            }),
        ).toEqual({
            holder_name: 'Ada',
            email: 'ada@tevi.com',
            email_phone_number: 'ada@tevi.com',
            phone_number: 'ada@tevi.com',
        })
    })

    it('keeps legacy’s empty `bank` beside the bank name', () => {
        expect(
            payoutDetailBody({
                method: method({ slug: 'bank_transfer' }),
                countryCode: 'VN',
                values: { bank_name: 'Vietcombank', account_number: '123', holder_name: 'Ada' },
            }),
        ).toEqual({
            bank: '',
            bank_name: 'Vietcombank',
            account_number: '123',
            holder_name: 'Ada',
        })
    })

    it('posts the US variant that was filled in, and only its fields', () => {
        const values = {
            individual_ssn: '111',
            corp_ein: '222',
            corp_name: 'Tevi LLC',
            account_number: '333',
            holder_name: 'Ada',
            bank_routing_number: '444',
            zipcode: '10001',
        }
        const bank = method({ slug: 'bank_transfer' })

        expect(
            payoutDetailBody({ method: bank, countryCode: 'US', variant: 'individual', values }),
        ).toEqual({
            individual_ssn: '111',
            account_number: '333',
            holder_name: 'Ada',
            bank_routing_number: '444',
            zipcode: '10001',
        })

        expect(
            payoutDetailBody({ method: bank, countryCode: 'US', variant: 'corporation', values }),
        ).toEqual({
            corp_ein: '222',
            corp_name: 'Tevi LLC',
            account_number: '333',
            bank_routing_number: '444',
            zipcode: '10001',
        })
    })

    it('posts exactly the schema’s fields for a method it does not know', () => {
        expect(
            payoutDetailBody({
                method: method({
                    slug: 'gopay',
                    form: [
                        { field: 'wallet_name', displayName: 'Wallet name', choices: [] },
                        { field: 'phone_number', displayName: 'Phone', choices: [] },
                    ],
                }),
                countryCode: 'ID',
                // `extra` is not in the schema, so it must not reach the wire.
                values: { wallet_name: 'Ada', phone_number: '628', extra: 'no' },
            }),
        ).toEqual({ wallet_name: 'Ada', phone_number: '628' })
    })

    it('trims, so a pasted value with a trailing space is not saved with one', () => {
        expect(
            payoutDetailBody({
                method: method({ slug: 'vai_wallet' }),
                countryCode: 'VN',
                values: { wallet_address: '  vai-123  ' },
            }),
        ).toEqual({ wallet_address: 'vai-123' })
    })
})

describe('payoutConfigBody', () => {
    it('carries the method id and the billing contact beside the detail', () => {
        expect(
            payoutConfigBody({
                method: method({ id: 'pm_9', slug: 'vai_wallet' }),
                countryCode: 'VN',
                values: { ...CONTACT, wallet_address: 'vai-123' },
            }),
        ).toEqual({
            payout_method_id: 'pm_9',
            payout_detail: { wallet_address: 'vai-123' },
            contact_name: 'Ada',
            contact_email: 'ada@tevi.com',
        })
    })
})

describe('initialPayoutFormValues', () => {
    it('prefills the contact and leaves every choice unanswered', () => {
        /*
         * The divergence that matters most on this screen: legacy preselects the first option of every
         * `choices` field, which makes ERC20 the default answer to "which chain" — and a USDT transfer
         * on the wrong chain is money gone, not a rejected payout.
         */
        const usdt = initialPayoutFormValues({
            method: method({
                slug: 'usdt',
                form: [
                    { field: 'wallet_address', displayName: 'Address', choices: [] },
                    {
                        field: 'network',
                        displayName: 'Network',
                        choices: [
                            { id: '1', name: 'ERC20', logo: '' },
                            { id: '2', name: 'BEP20', logo: '' },
                        ],
                    },
                ],
            }),
            countryCode: 'VN',
            contactName: 'Ada',
            contactEmail: 'ada@tevi.com',
        })
        expect(usdt).toEqual({
            contact_name: 'Ada',
            contact_email: 'ada@tevi.com',
            wallet_address: '',
            network: '',
        })

        const bank = initialPayoutFormValues({
            method: method({
                slug: 'bank_transfer',
                form: [
                    {
                        field: 'bank',
                        displayName: 'Bank',
                        choices: [{ id: '1', name: 'Agribank', logo: '' }],
                    },
                ],
            }),
            countryCode: 'VN',
            contactName: '',
            contactEmail: '',
        })
        expect(bank.bank_name).toBe('')
    })

    it('leaves a schema-driven method’s wallet picker unanswered too', () => {
        // DANA is not everybody's e-wallet, and the phone number beside it is not portable between
        // providers — so the provider is a question, not a default.
        const values = initialPayoutFormValues({
            method: method({
                slug: 'gopay_id',
                form: [
                    {
                        field: 'wallet_name',
                        displayName: 'Wallet',
                        choices: [
                            { id: '1', name: 'DANA', logo: '' },
                            { id: '2', name: 'OVO', logo: '' },
                        ],
                    },
                ],
            }),
            countryCode: 'ID',
            contactName: 'Ada',
            contactEmail: 'ada@tevi.com',
        })
        expect(values.wallet_name).toBe('')
    })
})

describe('reportPayoutFormDrift', () => {
    it('names a field the backend asked for that the form does not collect', () => {
        // The failure it exists for: the backoffice adds a field to a method whose form is written in
        // code, and the only symptom is a 400 about a field the reader never saw.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        reportPayoutFormDrift(
            method({
                slug: 'payoneer',
                form: [
                    { field: 'holder_name', displayName: 'Holder name', choices: [] },
                    { field: 'email', displayName: 'Email', choices: [] },
                    { field: 'tax_id', displayName: 'Tax ID', choices: [] },
                ],
            }),
            'VN',
        )
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('does not match'),
            expect.objectContaining({ askedForButNotCollected: ['tax_id'] }),
        )
        warn.mockRestore()
    })

    it('stays quiet when the two agree, and on the paths with nothing to compare', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        // Agreement.
        reportPayoutFormDrift(
            method({
                slug: 'payoneer',
                form: [
                    { field: 'holder_name', displayName: 'Holder name', choices: [] },
                    { field: 'email', displayName: 'Email', choices: [] },
                ],
            }),
            'VN',
        )
        // Stripe collects nothing here; the schema-driven path *is* `config.form`.
        reportPayoutFormDrift(method({ slug: 'stripe' }), 'US')
        reportPayoutFormDrift(
            method({
                slug: 'gopay_id',
                form: [{ field: 'wallet_name', displayName: 'Wallet', choices: [] }],
            }),
            'ID',
        )
        /*
         * And the bank transfer, whose picker reads `config.form`'s `bank` while the value is
         * submitted as `bank_name` — legacy's own arrangement, so it must not be reported as drift.
         */
        reportPayoutFormDrift(
            method({
                slug: 'bank_transfer',
                form: [
                    { field: 'bank', displayName: 'Bank', choices: [] },
                    { field: 'account_number', displayName: 'Account number', choices: [] },
                    { field: 'holder_name', displayName: 'Account name', choices: [] },
                ],
            }),
            'VN',
        )
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    it('compares a two-tab method against both tabs at once', () => {
        /*
         * The US bank transfer is one schema rendered as Individual and Corporation, so a comparison
         * against one tab reports the other's fields as uncollected — every time, for every US
         * creator.
         */
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        reportPayoutFormDrift(
            method({
                slug: 'bank_transfer',
                form: [
                    { field: 'individual_ssn', displayName: 'SSN', choices: [] },
                    { field: 'corp_ein', displayName: 'EIN', choices: [] },
                    { field: 'corp_name', displayName: 'Corporate name', choices: [] },
                    { field: 'account_number', displayName: 'Account number', choices: [] },
                    { field: 'holder_name', displayName: 'Account name', choices: [] },
                    { field: 'bank_routing_number', displayName: 'Routing', choices: [] },
                    { field: 'zipcode', displayName: 'ZIP', choices: [] },
                ],
            }),
            'US',
            'individual',
        )
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })
})
