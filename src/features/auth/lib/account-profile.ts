import type { AccountUser } from '@shared/lib/api/token'

/**
 * Reading a stored account's profile.
 *
 * `AccountUser` is an open record (`[key: string]: unknown`) because the `/me` DTO is not
 * modelled. That leaves every surface showing a face or a name to narrow `unknown` for
 * itself, which is how two screens end up disagreeing about which field holds the avatar.
 * The narrowing lives here once instead.
 *
 * ## The live payload, for the fields below
 *
 * A real `GET v1/me/` body, transcribed because the accessors here are the only contract
 * this app has for it:
 *
 * ```jsonc
 * { "id": 2533836474,            // ⚠ a NUMBER, not a string — see `accountUserId`
 *   "email": "…", "display_name": "…", "phone_number": null, "contact_email": null,
 *   "gender": null, "avatar": { "thumb": "https://…jpg" },   // object, and `thumb` only
 *   "country": "VN", "language": "en-US", "dob": "2006-06-09",  // bare date, no time
 *   "anonymous": false, "edited": true, "mcn": [], "is_streamer": true,
 *   "email_verified": true, "two_fa_passcode": true, "is_suspended": false,
 *   "allow_nsfw": true, "auto_follow": true, "chat_account": null, "fcm_token": "…",
 *   "nsfw_settings": { "blur_media": true, "nsfw_search": true, "show_sensitive": true } }
 * ```
 *
 * Three things it settles, all of them answers to questions this file used to carry:
 *
 * - **`anonymous` is restated** (B1), so the fold's preservation is belt and braces on the
 *   read path — see `account-fold.ts` for why it stays anyway.
 * - **There is no channel slug and no Premium flag** (B19, B21). Ownership therefore keeps
 *   its slug comparison against `MyChannelProvider`, and the shell's animated avatar reads
 *   `useMyChannel().isPremium` — `/me` cannot answer either.
 * - **`avatar` carries `thumb` alone** — no `avatar_video`. An account avatar in the nav,
 *   the tab bar or the switcher can never animate from this body.
 *
 * **`two_fa_passcode` is read by `accountTwoFaPasscode` below** — the flag that decides whether a
 * withdrawal has to be confirmed with a passcode. The question still open behind it is about the
 * *sign-in* path, not this one: see B88 in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
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
 * The account's numeric user ID as a string — what the drawer prints and copies.
 *
 * A `number` is stringified rather than rejected: `/me` returns it as one (legacy prints
 * `currentUser?.id` straight into `ID: {id}`), and `AccountUser.id` is typed `string | number`
 * for that reason. `String()` is exact for anything under 2^53, which every Tevi id is.
 *
 * `null` for an id that is missing or blank, so the caller can print `—` instead of the string
 * `"undefined"` and can hide a copy button that would put nothing on the clipboard.
 */
export function accountUserId(user: AccountUser | null | undefined): string | null {
    const id = user?.id
    if (typeof id === 'number') return Number.isFinite(id) ? String(id) : null
    return text(id)
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
 * (`1993-04-11T00:00:00Z`), and the only consumer is `shared/components/date-field.tsx`,
 * which — like the `<input type="date">` it replaced — speaks in the first ten characters.
 * Running it through `Date` instead would re-introduce the timezone bug that field's own
 * `toDateValue` exists to avoid: parsing a bare `YYYY-MM-DD` as UTC and formatting it
 * locally moves the birthday back a day for everyone west of Greenwich — silently, and
 * only for some users.
 *
 * Anything that is not ten leading digits in the right shape is `null`: a value the date
 * field cannot render would otherwise make it an uncontrolled field mid-session.
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

/**
 * **Two-step verification is on for this account** — `two_fa_passcode`.
 *
 * The flag legacy reads before a withdrawal (`confirmWithdraw/actions`: `if
 * (currentUser?.two_fa_passcode) handleOpen('twoFa')`), and the only thing on `/me` that gates an
 * action rather than describing the person.
 *
 * `=== true`, like `accountAutoFollow` — but the direction of the default is worth being explicit
 * about, because the two accessors are safe for *opposite* reasons. A missing `auto_follow` must not
 * render a switch as on. A missing `two_fa_passcode` reads as **off**, which sends the withdrawal
 * without a passcode — and that is still the right default, because the flag is not the control: the
 * **server** is. It refuses a request that needs one, and `payoutRequestOutcome` turns that refusal
 * into the same passcode step this flag would have raised a moment earlier. So a stale or absent
 * profile costs one round trip, not a bypass.
 *
 * Which is also why this must never be inverted "to be safe": defaulting to *on* would put a
 * passcode prompt in front of every account that has never set one, and there is nothing they could
 * type to get past it.
 */
export function accountTwoFaPasscode(user: AccountUser | null | undefined): boolean {
    return user?.two_fa_passcode === true
}

export function accountShowSensitive(user: AccountUser | null | undefined): boolean {
    return accountNsfwSettings(user).show_sensitive === true
}
