import type { TranslationKey } from '@shared/i18n/settings'
/**
 * How a saved payout method's fields are **labelled and ordered**, for both screens that print them.
 *
 * `payout_detail` is a bag whose keys depend on the method (`api/config-types.ts` says why), and two
 * screens render it: the request detail (`PayoutConfigRows`) and the method detail dialog on
 * `/my-wallet/payout-method`. Legacy has two separate hard-coded lists for those, in two different
 * orders, with `wallet_address` labelled *"Wallet address"* on one and *"Address"* on the other — so a
 * creator checking the same USDT wallet on two screens reads two different rows.
 *
 * One table means one answer. It lives in `lib/` rather than beside either component because neither
 * screen owns it, and it holds no JSX so a `loading.tsx` could import it without dragging a tree in.
 *
 * ⚠ The payload also carries `payout_method.config.form` — the backend describing its own form, with a
 * `display_name` per field. That is a better source than this table (it can label a field this client
 * has never seen) and **B89** asks for it to be published; the setup form already reads it. It is not
 * used *here* because these two screens print a saved config, where a wrong label is worse than a
 * missing row: `display_name` is the label for *entering* a value ("Bank routing"), not always the one
 * for reading it back.
 */

/**
 * The keys these screens print, and the translation key for each.
 *
 * `bank` is deliberately absent even though the live payload carries it: it holds the **same value**
 * as `bank_name`, so printing everything the backend sent shows the bank twice. That is the whole
 * reason this is an allowlist rather than an iteration over the bag.
 */
export const PAYOUT_CONFIG_LABELS: Record<string, TranslationKey> = {
    wallet_address: 'payout_config_wallet_address',
    network: 'payout_config_network',
    holder_name: 'payout_config_account_name',
    account_number: 'payout_config_account_number',
    bank_name: 'payout_config_bank_name',
    /*
     * **Not in legacy's read-back list**, and added deliberately. Legacy asks for a bank routing
     * number on the US bank-transfer form and then never shows it again — so the one field a creator
     * is most likely to have fat-fingered is the one they cannot check. It is the same bag either way;
     * the omission was an oversight, not a policy.
     */
    bank_routing_number: 'payout_config_bank_routing',
    individual_ssn: 'payout_config_individual_ssn',
    corp_ein: 'payout_config_corporate_ein',
    corp_name: 'payout_config_corporate_name',
    zipcode: 'payout_config_zipcode',
    email: 'payout_config_email',
    email_phone_number: 'payout_config_email_or_phone',
}

/** One order for both screens, so two payouts by the same method read the same way. */
export const PAYOUT_CONFIG_ORDER = Object.keys(PAYOUT_CONFIG_LABELS)

/**
 * The fields legacy marks `copy: true`, and the reason is the same for all of them: they are strings a
 * creator checks against a bank app or a block explorer, character by character. A name or a country
 * is read, not transcribed.
 */
export const PAYOUT_CONFIG_COPYABLE = new Set(['wallet_address', 'network', 'account_number'])

/**
 * The label for one field, given the method it belongs to.
 *
 * One method-specific override, and it is legacy's own: a **USDT** `wallet_address` is labelled
 * *"Address"*, because that is the word the USDT form asks for it with and the word Etherscan prints.
 * Every other method calls the same field a wallet address. Reproduced rather than normalised away, so
 * the row matches the field the creator filled in.
 */
export function payoutConfigLabelKey(
    field: string,
    methodSlug?: string,
): TranslationKey | undefined {
    if (field === 'wallet_address' && methodSlug?.toLowerCase() === 'usdt') {
        return 'payout_config_address'
    }
    return PAYOUT_CONFIG_LABELS[field]
}
