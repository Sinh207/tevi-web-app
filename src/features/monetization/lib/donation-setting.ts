import type { BadgeStatus } from '@shared/ui/badge'
import type { DonationSettingPayload } from '../api/donation-api'
import type {
    DonationPrice,
    DonationRow,
    DonationSetting,
    DonationTerm,
    DonationUnit,
} from '../api/donation-types'
import { STAR_CURRENCY, STAR_PER_USD, USD_CURRENCY } from './membership-tier'

/**
 * The rules `/monetization/donation` is built on — the unit table, the two date ranges, the amount
 * field's arithmetic, and the payload the setup form writes.
 *
 * Pure, so `donation-setting.test.ts` can pin the parts that fail **quietly**. Every one of the five
 * below is a silent failure in legacy or on the wire:
 *
 * - a `date_range` the API's enum does not contain (legacy sends one),
 * - an amount field that accepts `1.999` and posts `2.00`,
 * - a payload whose `prices` carry the wrong currency codes, which is accepted and charges wrong,
 * - a status string the row has no colour for, which legacy paints grey and labels with the raw
 *   wire value,
 * - a supporter figure derived from the wrong field.
 */

/**
 * The four units a creator picks between, in legacy's order, with legacy's emoji.
 *
 * **Data, not markup**, and the same call `methods.ts` makes: order, glyph and label live in one
 * table so the composition is written once and the test can assert the set without a renderer.
 *
 * The emoji are legacy's own (`DONATION_UNITS` in its constants) and they are **not** DS icons —
 * which is why they are text rather than `<Icon>`: `CLAUDE.md` forbids substituting a shape for a
 * missing glyph, and the sprite draws no pizza, no rose and no open book. An emoji is the design's
 * own mark here rather than a stand-in for one.
 *
 * `key` is the wire's `IconEnum` value, so this table is also what closes that enum for the form.
 */
export const DONATION_UNIT_OPTIONS: readonly {
    key: DonationUnit
    emoji: string
    labelKey: string
}[] = [
    { key: 'coffee', emoji: '☕', labelKey: 'monetization_donation_unit_coffee' },
    { key: 'pizza', emoji: '🍕', labelKey: 'monetization_donation_unit_pizza' },
    { key: 'book', emoji: '📖', labelKey: 'monetization_donation_unit_book' },
    { key: 'rose', emoji: '🌹', labelKey: 'monetization_donation_unit_rose' },
]

/** The two words a contribution can be labelled with — the wire's `ButtonTextEnum`, capitalised. */
export const DONATION_TERM_OPTIONS: readonly { key: DonationTerm; labelKey: string }[] = [
    { key: 'Donate', labelKey: 'monetization_donation_term_donate' },
    { key: 'Tip', labelKey: 'monetization_donation_term_tip' },
]

/**
 * The two date ranges the overview offers — **the API's spellings**, which legacy gets wrong.
 *
 * billy's `date_range` enum is `1m | 30d | 60d | 7d | thisMonth`, and legacy sends **`this_month`**:
 * a value in no enum, on both the summary and the donations call, every time a creator picks "This
 * month". DRF answers the default (`thisMonth`) or a 400 depending on the serializer, so the screen
 * either silently ignores the choice or fails — and legacy's own error handler prints "Failed to get
 * donation summary", which names nothing.
 *
 * Only two of the five are offered, because legacy's menu offers two. The other three are a product
 * decision, not a client one; the enum is written down here so adding one is a line rather than a
 * guess.
 */
export const DONATION_RANGES = ['7d', 'thisMonth'] as const
export type DonationRange = (typeof DONATION_RANGES)[number]

/** How many days `7d` covers, as the label says out loud. Seven **inclusive of today**. */
export const DONATION_RANGE_DAYS = 7

/** Legacy's cap on a unit's price, in USD. */
export const DONATION_MAX_AMOUNT = 10_000

/** The schema's `maxLength` on `thank_you_msg`. Legacy enforces nothing here either. */
export const DONATION_MESSAGE_MAX = 500

/**
 * The half-open window a range covers, in epoch milliseconds.
 *
 * `now` is a parameter rather than read inside, which is the only way a test can state what "this
 * month" means without freezing the clock — and the only way the analytics banner and the label can
 * be built from the *same* instant instead of two `new Date()`s a render apart.
 *
 * **Local time, not UTC**, for the reason `member-date.ts` gives: this is a span somebody checks
 * against their own calendar, so a boundary a day off is wrong about the thing they came to read.
 * The panel is client-only (there is no SSR bearer), so no cached HTML can disagree.
 *
 * `7d` starts **six** days back, not seven — legacy's `subDays(now, 6)`, which is what makes a range
 * labelled "last 7 days" contain seven days once today is counted.
 */
export function donationRangeBounds(
    range: DonationRange,
    now: Date = new Date(),
): { startMs: number; endMs: number } {
    const endMs = now.getTime()

    if (range === 'thisMonth') {
        return { startMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), endMs }
    }

    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    start.setDate(start.getDate() - (DONATION_RANGE_DAYS - 1))
    return { startMs: start.getTime(), endMs }
}

/**
 * "Sep 3 – Sep 9" for a range, in the reader's locale.
 *
 * `formatRange` rather than two formats joined by a hyphen, which is what legacy does
 * (`${fDate(start)} - ${fDate(now)}`). The difference is not cosmetic: `Intl` collapses a shared
 * month to *"Sep 3 – 9"*, uses the locale's own dash and spacing, and puts the parts in the locale's
 * own order — `3 thg 9 – 9 thg 9` in `vi`, `9月3日～9月9日` in `ja`. The hard-coded `MMM d` is US
 * order in all nine of ours.
 *
 * Returns `''` on an unusable pair, which the caller reads as "print no label" rather than a dash
 * between two blanks.
 */
export function formatDonationRangeLabel(
    range: DonationRange,
    locale = 'en',
    now: Date = new Date(),
): string {
    const { startMs, endMs } = donationRangeBounds(range, now)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return ''

    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    try {
        return new Intl.DateTimeFormat(locale, options).formatRange(
            new Date(startMs),
            new Date(endMs),
        )
    } catch {
        // An unsupported locale tag must not take the header down.
        return new Intl.DateTimeFormat('en', options).formatRange(
            new Date(startMs),
            new Date(endMs),
        )
    }
}

/** The amount for one currency on a setting, or `null` when it does not carry that currency. */
export function donationPriceIn(
    prices: readonly DonationPrice[] | undefined,
    currency: string,
): number | null {
    const row = prices?.find(price => price.amount_currency === currency)
    return row ? row.amount : null
}

/**
 * What one unit costs, in USD — the figure the setup form opens on.
 *
 * `null` when the setting carries no USD price, which the form reads as "fall back to the default"
 * rather than as `$0`. Legacy's `parseFloat(usdPrice.amount)` over a missing row yields `NaN` and
 * puts `NaN` in the input.
 */
export function donationUsdPrice(setting: DonationSetting | null | undefined): number | null {
    return donationPriceIn(setting?.prices, USD_CURRENCY)
}

/**
 * The Star figure a USD amount is advertised at.
 *
 * `STAR_PER_USD` is the platform rate the membership ladder is built on, imported rather than
 * re-declared — legacy writes `STAR_CONVERSION_RATE = 100` a second time in the donation folder,
 * which is two constants for one platform fact.
 *
 * Rounded to two decimals the way legacy rounds it (`Math.round(x * 100) / 100`), because the wire
 * takes a `decimal` with two places and `10.005 * 100` is not representable.
 */
export function starsForUsd(usd: number): number {
    if (!Number.isFinite(usd) || usd <= 0) return 0
    return Math.round(usd * STAR_PER_USD * 100) / 100
}

/**
 * The amount field's own arithmetic — what a keystroke does to the value.
 *
 * Legacy's `handleAmountChange`, restated as a pure function so its four refusals can be pinned. It
 * keeps the raw **string** rather than a number, which is the only way `"10."` can exist between two
 * keystrokes: parsing on every change turns `10.` into `10` and eats the decimal point the moment it
 * is typed.
 *
 * The rules, in legacy's order:
 *
 * 1. non-numeric characters are dropped;
 * 2. `''` and `'.'` are allowed through (an empty field, and the start of `0.5`) — `.` normalising
 *    to `0.`, which is legacy's own special case;
 * 3. a **second** decimal point, or a **third** decimal place, is refused — the previous value
 *    stands, so the keystroke does nothing rather than silently reformatting what is already typed;
 * 4. anything over `DONATION_MAX_AMOUNT` clamps to it.
 *
 * ⚠ Rule 3 returns `previous`, which is why it is a parameter. Legacy `return`s from the handler
 * without calling `setState`, which has the same effect only because the input is controlled — the
 * distinction is invisible until this is a function, and inverting it would let `1.999` be typed and
 * then posted as `2.00`.
 *
 * ## ⚠ The typed string is returned, **never `String(Number(typed))`** — and this is a price bug
 *
 * Legacy stores the amount as a **number** (`setAmountPerUnit(num)`), and so did this function's
 * first cut. Both delete a `0` sitting immediately after the decimal point, because `Number("1.0")`
 * is `1`:
 *
 * ```
 * "1"  → "1"     "1." → "1."     "1.0" → "1"     "1.05" → "15"
 * ```
 *
 * Typing `1.05` one key at a time therefore ends at **`15`**, and Save posts `{ amount: "15.00" }` —
 * a 14× price change with nothing on screen saying anything happened. `0.05` becomes `5`, a 100×
 * one. It survives every rule above because each keystroke is individually valid.
 *
 * So the cleaned string is returned as typed. The only normalising left is a leading run of zeros
 * before another **digit** (`007` → `7`), which cannot swallow a decimal because the lookahead
 * requires a digit — `0.5` and `0` are both untouched. `Number` is still used, but only to *judge*
 * the value (finite, within the cap), never to produce the value.
 *
 * A **deliberate divergence from `web-app`**, which has this bug today.
 */
export function parseDonationAmountInput(raw: string, previous: string): string {
    const cleaned = raw.replace(/[^0-9.]/g, '')

    if (cleaned === '') return ''
    if (cleaned === '.') return '0.'

    const parts = cleaned.split('.')
    if (parts.length > 2) return previous
    if ((parts[1]?.length ?? 0) > 2) return previous

    const value = Number.parseFloat(cleaned)
    if (!Number.isFinite(value)) return previous
    if (value > DONATION_MAX_AMOUNT) return String(DONATION_MAX_AMOUNT)

    return cleaned.replace(/^0+(?=\d)/, '')
}

/** The USD number the field's string stands for. `0` for an empty or half-typed value. */
export function donationAmountValue(raw: string): number {
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) && value > 0 ? value : 0
}

export interface DonationFormValues {
    unit: DonationUnit
    /** The amount field's raw string — see `parseDonationAmountInput`. */
    amount: string
    term: DonationTerm
    message: string
    displaySupporterCount: boolean
    isActive: boolean
}

/**
 * The write body.
 *
 * **Both prices, both as strings with two decimals**, which is legacy's payload and the schema's
 * type (`Price.amount` is `format: decimal`). USD first then Star, which is the opposite of
 * `pricesPayload`'s order for a membership tier — kept per-endpoint rather than harmonised, for the
 * reason that file gives: this is the payload that has been shipping, and tidying a wire format is
 * how a write starts being rejected for a reason no screen can explain (**B104**).
 *
 * `name` **and** `icon` both carry the unit, lower-cased — which is also why there is no
 * `DONATION_NAME_MAX` constant beside `DONATION_MESSAGE_MAX`: the schema caps `name` at 50, and the
 * longest value this form can ever write is `"coffee"`. A limit no input can reach is not a limit.
 *
 * `name` **and** `icon` both carry the unit, lower-cased. That is legacy's payload too, and it is
 * why the unit chips are the only control that writes either — `name` is a free `maxLength: 50`
 * string on the wire, so nothing stops it drifting from `icon`, and nothing in either client would
 * notice if it did.
 *
 * `thank_you_msg` is sent **trimmed, and as `''` when blank** rather than omitted — the schema marks
 * it `nullable` and legacy sends the raw value, so `''` is how a creator clears a message they had.
 * Omitting the key on a `PATCH` would leave the old line in place, which is the one behaviour a
 * reader who just emptied the box would not expect.
 */
export function buildDonationPayload(values: DonationFormValues): DonationSettingPayload {
    const usd = donationAmountValue(values.amount)
    const unit = values.unit.toLowerCase()

    return {
        name: unit,
        icon: unit,
        button_text: values.term,
        thank_you_msg: values.message.trim(),
        display_supporter_count: values.displaySupporterCount,
        is_active: values.isActive,
        prices: [
            { amount: usd.toFixed(2), amount_currency: USD_CURRENCY },
            { amount: starsForUsd(usd).toFixed(2), amount_currency: STAR_CURRENCY },
        ],
    }
}

/** The values a saved setting opens the form on, or the defaults when there is none. */
export function donationFormValues(
    setting: DonationSetting | null | undefined,
): DonationFormValues {
    if (!setting) {
        return {
            unit: 'coffee',
            // Legacy's initial `amountPerUnit`. `'10'`, not `10`: the field's value is a string.
            amount: '10',
            term: 'Donate',
            message: '',
            displaySupporterCount: false,
            isActive: true,
        }
    }

    const usd = donationUsdPrice(setting)
    return {
        unit: setting.icon,
        amount: usd === null ? '10' : String(usd),
        term: setting.button_text,
        message: setting.thank_you_msg ?? '',
        displaySupporterCount: setting.display_supporter_count,
        isActive: setting.is_active,
    }
}

/** Whether the form differs from what is saved — the Save button's gate. Legacy's `hasChanges`. */
export function donationFormChanged(
    values: DonationFormValues,
    setting: DonationSetting | null | undefined,
): boolean {
    if (!setting) return true
    const saved = donationFormValues(setting)
    return (
        values.unit !== saved.unit ||
        donationAmountValue(values.amount) !== donationAmountValue(saved.amount) ||
        values.term !== saved.term ||
        values.message !== saved.message ||
        values.displaySupporterCount !== saved.displaySupporterCount ||
        values.isActive !== saved.isActive
    )
}

/**
 * What a row is worth to the creator, in USD.
 *
 * `usd_amount` first and `amount` second, which is legacy's preference — and the fallback is only
 * correct when the row is *already* in USD. A `TVS` row with no `usd_amount` would otherwise print
 * its Star count with a dollar sign in front of it, which is legacy's behaviour and off by 100×.
 * `null` says the row has no figure this client can state, and the row prints none.
 */
export function donationAmountUsd(row: DonationRow): number | null {
    if (row.usd_amount > 0) return row.usd_amount
    if (row.amount > 0 && row.amount_currency === USD_CURRENCY) return row.amount
    if (row.amount > 0 && row.amount_currency === STAR_CURRENCY) return row.amount / STAR_PER_USD
    return null
}

/**
 * The three payout states a row can be in, closed against the wire's free text.
 *
 * Legacy maps `success → done`, keeps `refunded` and `pending`, and for anything else paints the
 * **raw wire value in grey** — so a backend that starts sending `on_hold` puts the string `on_hold`
 * on a creator's dashboard in a colour that means nothing. `null` here is "say nothing", which is
 * the honest version: the amount and the supporter are still true.
 *
 * `payout_status` is `readOnly` free text in the schema with no enum, so these three are legacy's
 * word and nothing more — **B104** asks for the vocabulary.
 *
 * The tone maps onto `Badge`'s own statuses rather than to raw accent inks, which is what keeps the
 * label legible in Light: `docs/DESIGN_SYSTEM.md` §6b and the measurements behind it record that
 * `--accents-success-active` is **2.32** against a light panel, so an ink-on-nothing status line
 * fails AA. `Badge` paints the tint block underneath it.
 */
export interface DonationStatusDisplay {
    tone: BadgeStatus
    labelKey: string
}

export function donationStatusDisplay(
    status: string | null | undefined,
): DonationStatusDisplay | null {
    switch (status?.trim().toLowerCase()) {
        case 'success':
        case 'done':
        case 'completed':
            return { tone: 'success', labelKey: 'monetization_donation_status_done' }
        case 'refunded':
            return { tone: 'error', labelKey: 'monetization_donation_status_refunded' }
        case 'pending':
            return { tone: 'info', labelKey: 'monetization_donation_status_pending' }
        default:
            return null
    }
}
