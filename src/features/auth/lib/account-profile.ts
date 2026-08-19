import type { AccountUser } from '@shared/lib/api/token'

/**
 * Reading a stored account's profile.
 *
 * `AccountUser` is an open record (`[key: string]: unknown`) because the `/me` DTO is
 * not modelled yet — see [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 * That leaves every surface showing a face or a name to narrow `unknown` for itself,
 * which is how two screens end up disagreeing about which field holds the avatar. The
 * narrowing lives here once instead.
 *
 * Field names are legacy's, since that is the contract until the DTO is typed:
 * `display_name` and `email`, and an avatar **object** rather than a URL —
 * `../tevi-web-app` reads `currentUser?.avatar?.thumb` at 28 call sites and never a
 * bare `avatar`. A plain string is accepted as well, so a backend that flattens the
 * field one day blanks nothing.
 *
 * Every accessor returns `null` rather than `''` for "not there": an empty string is
 * truthy enough to slip through a `??` and render an invisible name.
 */

/** A non-blank string, or nothing. Whitespace is not a display name. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * The avatar to render, or `null` for the placeholder.
 *
 * Hosts are allow-listed in `next.config.ts`, so the result can go straight to
 * `next/image`.
 */
export function accountAvatarUrl(user: AccountUser | null | undefined): string | null {
    const avatar = user?.avatar
    if (avatar && typeof avatar === 'object') {
        return text((avatar as Record<string, unknown>).thumb)
    }
    return text(avatar)
}

export function accountDisplayName(user: AccountUser | null | undefined): string | null {
    return text(user?.display_name)
}

export function accountEmail(user: AccountUser | null | undefined): string | null {
    return text(user?.email)
}

/**
 * Auto-follow — the profile flag behind the drawer's Auto Follow switch.
 *
 * `=== true`, not truthy: the field is simply absent on an anonymous profile, and a
 * switch that renders as *on* because its value was missing is a setting the visitor
 * never chose. Same reasoning as the `null`-over-`''` rule above.
 */
export function accountAutoFollow(user: AccountUser | null | undefined): boolean {
    return user?.auto_follow === true
}

/**
 * The account's date of birth as `YYYY-MM-DD`, or `null`.
 *
 * **Truncated, not parsed.** The field arrives as either a bare date or a full timestamp
 * (`1993-04-11T00:00:00Z`), and the only consumer is a `<input type="date">`, which takes
 * exactly the first ten characters. Running it through `Date` instead would re-introduce
 * the timezone bug that `toDateInputValue` exists to avoid: parsing a bare `YYYY-MM-DD` as
 * UTC and formatting it locally moves the birthday back a day for everyone west of
 * Greenwich — silently, and only for some users.
 *
 * Anything that is not ten leading digits in the right shape is `null`: a value the date
 * input cannot render would otherwise make it an uncontrolled field mid-session.
 */
export function accountDob(user: AccountUser | null | undefined): string | null {
    const value = text(user?.dob)
    if (!value) return null
    const date = value.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

/**
 * The `nsfw_settings` object as the backend stores it, `{}` when there is none.
 *
 * Returned whole rather than one flag at a time because the write endpoint takes the
 * whole object: flipping `show_sensitive` means sending its siblings back untouched, or
 * they are cleared. Legacy spreads `currentUser?.nsfw_settings` for exactly this reason
 * (`iconBtnMenu/.../btnAllowSensitiveContent`) — with no guard, so an account without the
 * object spreads `undefined` and posts a settings blob of one field.
 */
export function accountNsfwSettings(user: AccountUser | null | undefined): Record<string, unknown> {
    const settings = user?.nsfw_settings
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        return settings as Record<string, unknown>
    }
    return {}
}

export function accountShowSensitive(user: AccountUser | null | undefined): boolean {
    return accountNsfwSettings(user).show_sensitive === true
}
