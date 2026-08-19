import { describe, expect, it } from 'vitest'
import { normalizeChannelPermission } from './types'

/**
 * What this parser promises that no gate can show:
 *
 * - **an absent grant is denied, and that is not an error.** The payload only carries the grants an
 *   account has, so an ordinary creator's response is `{}`;
 * - **only `true` is yes.** `"false"` is truthy in JS, so a retyped column would otherwise grant a
 *   money-moving feature to everybody;
 * - **the two grants spell their flag differently** (`allowed` vs `is_active`) and both are read
 *   correctly — this is the file that knows that, so nothing else has to;
 * - **an unknown grant survives parsing**, which is what lets a capability be added for a backend
 *   feature that shipped after this schema did.
 */
describe('normalizeChannelPermission', () => {
    it('reads both grants, each by its own flag name', () => {
        const p = normalizeChannelPermission({
            transfer_star: { allowed: true },
            fiat_agency: { is_active: true, name: 'Tevi VN', payout_method: [] },
        })
        expect(p.canTransferStar).toBe(true)
        expect(p.fiatAgency.isActive).toBe(true)
        expect(p.fiatAgency.name).toBe('Tevi VN')
    })

    /* An ordinary creator. A successful response with no grants in it. */
    it('denies everything for an empty payload without failing', () => {
        const p = normalizeChannelPermission({})
        expect(p.canTransferStar).toBe(false)
        expect(p.fiatAgency).toEqual({ isActive: false, name: '', payoutMethods: [] })
    })

    it('denies everything for a payload that is not an object', () => {
        for (const body of [null, undefined, 'nope', 42, []]) {
            const p = normalizeChannelPermission(body)
            expect(p.canTransferStar).toBe(false)
            expect(p.fiatAgency.isActive).toBe(false)
        }
    })

    /*
     * The one that matters most in this file. Every value below is truthy in JS, and each of them is a
     * plausible thing for a backend to send after a column type changes.
     */
    it('treats anything other than true as no', () => {
        for (const value of ['false', 'true', '1', 'yes', {}, [], 'on']) {
            expect(
                normalizeChannelPermission({ transfer_star: { allowed: value } }).canTransferStar,
            ).toBe(false)
        }
    })

    /* A `TINYINT(1)` serialised without a cast — the one other unambiguous spelling of yes. */
    it('accepts 1 as yes', () => {
        expect(normalizeChannelPermission({ transfer_star: { allowed: 1 } }).canTransferStar).toBe(
            true,
        )
        expect(normalizeChannelPermission({ transfer_star: { allowed: 0 } }).canTransferStar).toBe(
            false,
        )
    })

    describe('payout methods', () => {
        it('normalises ids to strings and fees to numbers', () => {
            const p = normalizeChannelPermission({
                fiat_agency: {
                    is_active: true,
                    name: 'Agency',
                    payout_method: [
                        {
                            id: 7,
                            name: 'Bank Transfer',
                            currency: 'VND',
                            is_active: true,
                            transaction_fee_rate: '1.5',
                            transaction_fee_fixed_amount: 2,
                        },
                    ],
                },
            })
            /*
             * A number id compared with `===` against a `<Radio value>` string is why legacy's method
             * toggle silently toggles nothing.
             */
            expect(p.fiatAgency.payoutMethods[0]).toEqual({
                id: '7',
                name: 'Bank Transfer',
                currency: 'VND',
                isActive: true,
                feeRate: 1.5,
                feeFixed: 2,
            })
        })

        it('defaults unreadable fees to 0 rather than null', () => {
            const p = normalizeChannelPermission({
                fiat_agency: {
                    is_active: true,
                    payout_method: [{ id: 1, transaction_fee_rate: 'abc' }],
                },
            })
            // `null` in a controlled number input is a React warning plus an uncontrolled field.
            expect(p.fiatAgency.payoutMethods[0]?.feeRate).toBe(0)
            expect(p.fiatAgency.payoutMethods[0]?.feeFixed).toBe(0)
        })

        it('is an empty array, never undefined, when the payload has no methods', () => {
            expect(
                normalizeChannelPermission({ fiat_agency: { is_active: true } }).fiatAgency
                    .payoutMethods,
            ).toEqual([])
            expect(
                normalizeChannelPermission({
                    fiat_agency: { is_active: true, payout_method: 'nope' },
                }).fiatAgency.payoutMethods,
            ).toEqual([])
        })

        /*
         * Two id-less rows both match `'' === ''` in the settings form, so toggling one toggles both and
         * the save sends entries the backend cannot place.
         */
        it('drops a method with no id rather than keeping an unsaveable row', () => {
            const p = normalizeChannelPermission({
                fiat_agency: {
                    is_active: true,
                    payout_method: [{ name: 'Bank Transfer' }, { id: 4, name: 'E-Wallet' }],
                },
            })
            expect(p.fiatAgency.payoutMethods.map(m => m.id)).toEqual(['4'])
        })

        it('drops a row that cannot be parsed rather than the whole grant', () => {
            const p = normalizeChannelPermission({
                fiat_agency: {
                    is_active: true,
                    payout_method: [null, { id: 2, name: 'E-Wallet' }, 'nope'],
                },
            })
            expect(p.fiatAgency.isActive).toBe(true)
            expect(p.fiatAgency.payoutMethods.map(m => m.id)).toEqual(['2'])
        })
    })

    /* The reason the schema is `looseObject`: a grant added next month is gateable without a release. */
    it('carries a grant it has no field for', () => {
        const p = normalizeChannelPermission({
            transfer_star: { allowed: false },
            some_new_feature: { allowed: true },
        })
        expect(p.raw.some_new_feature).toEqual({ allowed: true })
    })

    /*
     * `raw` is the body, not the parsed object. The schema defaults the two named grants, so a parsed
     * `{}` carries a `transfer_star` key the wire never sent — and anything asking "which grants does
     * this account have?" would read the client's own defaults back as facts.
     */
    it('does not invent grant keys the payload did not contain', () => {
        expect(normalizeChannelPermission({}).raw).toEqual({})
        expect(Object.keys(normalizeChannelPermission({ a: { allowed: true } }).raw)).toEqual(['a'])
        expect(normalizeChannelPermission(['nope']).raw).toEqual({})
    })
})
