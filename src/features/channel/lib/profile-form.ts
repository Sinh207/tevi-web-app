import type { ChannelPatch } from '../api/channel-api'
import type { Channel, ChannelSocialLink } from '../api/types'

/**
 * Everything the edit-profile form knows that is **not** React.
 *
 * The form has seven controls, three of which can be wrong in more than one way, and one of
 * which (the diff sent to the server) decides whether a save spends the account's one username
 * change per week. None of that is testable through a component, so all of it lives here:
 * limits, the local mirror of the name rules, and the two functions that answer *has anything
 * changed* and *what exactly should be sent*.
 *
 * See `edit-profile-view.tsx` for the screen and `image-crop.ts` for the picture side.
 */

// ── limits, all of them legacy's ──────────────────────────────────────────────────────────

/** Display name, from the rule list legacy renders under the field. */
export const NAME_MIN = 6
export const NAME_MAX = 50
/** Bio. Legacy checks this client-side on every keystroke and so does this. */
export const DESCRIPTION_MAX = 500
/** "Add up to 4 social links that will display on your Space profile." */
export const SOCIAL_LINKS_MAX = 4
/** Legally the account must be 18. The picker's `max` and the only date rule there is. */
export const MIN_AGE_YEARS = 18

/** Avatar and cover: 2 MB, JPEG or PNG. Legacy rejects anything else before the cropper opens. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const IMAGE_TYPES = ['image/jpeg', 'image/png'] as const

/**
 * The premium looping avatar: 50 MB, ten seconds, MP4/MOV/WebM.
 *
 * ⚠ **Ten seconds is a hard rejection here, where legacy offers a trimmer.** Legacy opens a
 * client-side video trimmer on desktop for a longer clip and, on mobile, shows a dialog pointing
 * at the native app. Trimming is not ported — it is a real piece of work (frame-accurate seeking,
 * re-encode, a scrub UI) and inventing half of it would be worse than not having it. So a long
 * clip is refused with the reason and the same suggestion legacy's mobile branch gives, and the
 * gap is written down rather than papered over. `docs/DEFINITION_OF_DONE.md` §1: say what the
 * state is.
 */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const VIDEO_MAX_SECONDS = 10
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

/** Cover is 16:9 in the cropper; the avatar is square. Legacy's `aspectOn`. */
export const COVER_ASPECT = 16 / 9
export const AVATAR_ASPECT = 1

// ── the form's own value shape ────────────────────────────────────────────────────────────

/**
 * A social link as the *editor* holds it.
 *
 * Not `ChannelSocialLink`: that carries an `id` the client never writes and its `url` is
 * nullable, while a row being edited always has a string in the box — `''` before anything is
 * typed. Modelling the two the same would mean `?? ''` at every input and a `null` slipping into
 * a `value=` prop, which is how a controlled input becomes an uncontrolled one mid-session.
 */
export interface SocialLinkDraft {
    platform: string
    /** The platform's human name, which the API stores alongside the slug. */
    title: string | null
    url: string
}

export interface ProfileImages {
    /** A URL — either the channel's existing one or a `blob:` preview of a pending crop. */
    thumb: string | null
    cover: string | null
    /** The channel's `images.avatar_video`, or `null` once the avatar is a still again. */
    avatarVideo: unknown
}

export interface ProfileValues {
    name: string
    slug: string
    description: string
    /** `YYYY-MM-DD`, or `''`. Lives on `/me`, not on the channel — see `buildChannelPatch`. */
    dateOfBirth: string
    categories: string[]
    socialLinks: SocialLinkDraft[]
    showIncome: boolean
    images: ProfileImages
}

/** The form's starting point: the channel as loaded, plus the account's date of birth. */
export function profileValuesFromChannel(channel: Channel, dateOfBirth: string): ProfileValues {
    return {
        name: channel.name ?? '',
        slug: channel.slug,
        description: channel.description ?? '',
        dateOfBirth,
        categories: [...channel.categories],
        socialLinks: channel.social_links.map(toDraft),
        showIncome: channel.show_income,
        images: {
            thumb: channel.images.thumb,
            cover: channel.images.cover,
            avatarVideo: channel.images.avatar_video,
        },
    }
}

function toDraft(link: ChannelSocialLink): SocialLinkDraft {
    return { platform: link.platform ?? '', title: link.title, url: link.url ?? '' }
}

// ── validation the client can do on its own ───────────────────────────────────────────────

/**
 * The four rules legacy prints under the name field, as codes.
 *
 * They are the **server's** rules — legacy learns which ones failed by posting the name to
 * `v1/me/validate-display-name/` on an 800ms debounce and reading the `errors` array back. This
 * app checks the first three locally instead, and that is a deliberate difference:
 *
 * - Three of the four are arithmetic on a string. A network round trip to be told a name is five
 *   characters long is latency spent on an answer the client already has, and it arrives *after*
 *   the next keystroke has changed the input again.
 * - The fourth (`sensitive`) genuinely needs the server — a word list is not something to ship to
 *   a browser — so it is checked where it can be: the save. `PATCH my-channel/` answers with a
 *   field error for `name`, which the form shows on the field. See `parseChannelFieldErrors`.
 *
 * The cost of the difference is honest and small: a name with a blocked word is refused on Save
 * rather than while typing. The gain is that the other three are refused instantly and offline.
 */
export const NAME_RULES = ['min_length', 'max_length', 'invalid_characters'] as const
export type NameRule = (typeof NAME_RULES)[number]

/**
 * Letters, digits, whitespace and `@ . - _`.
 *
 * `\p{L}` and `\p{N}` with the `u` flag, **not** `A-Za-z0-9`: the character-class rule says
 * "letters, numbers" and a large part of this audience writes in Vietnamese, Korean, Chinese,
 * Arabic and Thai. An ASCII class would reject "Nguyễn" and "김지수" as invalid characters, which
 * is a rule nobody wrote and the kind of bug that only ever hits other people's names.
 */
const NAME_ALLOWED = /^[\p{L}\p{N}\s@.\-_]*$/u

/** Which of the local name rules the value breaks. Empty ⇒ it passes everything we can check. */
export function nameRuleFailures(value: string): NameRule[] {
    const name = value.trim()
    const failed: NameRule[] = []
    if (name.length < NAME_MIN) failed.push('min_length')
    if (name.length > NAME_MAX) failed.push('max_length')
    if (!NAME_ALLOWED.test(name)) failed.push('invalid_characters')
    return failed
}

/**
 * A URL a social link may actually point at.
 *
 * `http`/`https` only, and the scheme has to be written: this string ends up in an `href` on a
 * public profile, so `javascript:` is the case this exists to refuse — everything else is a
 * courtesy. Accepting a bare `tevi.com` and prefixing it silently is tempting and is how a typo
 * becomes a link to somewhere the creator did not intend.
 */
export function isValidLinkUrl(value: string): boolean {
    try {
        const url = new URL(value.trim())
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

/**
 * Complete a typed link into something a browser can open — `tevi.com` → `https://tevi.com`.
 *
 * ## Completing a scheme is not the same as guessing
 *
 * `isValidLinkUrl` refuses a bare host, and its note says accepting one "is how a typo becomes a
 * link to somewhere the creator did not intend". That still stands for *silently* accepting it.
 * What this does is different and is what every address bar does: it supplies the scheme the
 * person left off, on blur, **in the field**, where they can see the result and change it. Nothing
 * about the host is invented — `tevi.com` can only become `https://tevi.com`.
 *
 * It fires on blur rather than per keystroke because the alternative rewrites `h` into
 * `https://h` while someone is still typing.
 *
 * A value that already carries **any** scheme is left alone, including a wrong one: turning
 * `ftp://x` into `https://ftp://x` would be nonsense, and `javascript:` must reach the validator
 * intact so it can be refused rather than disguised.
 */
export function normalizeLinkUrl(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ''
    // Any scheme at all — `mailto:`, `ftp:`, `javascript:` — is the author's, not ours to touch.
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
    // `//host` is protocol-relative and means the same thing; give it the scheme too.
    const host = trimmed.replace(/^\/\//, '')
    // Only complete something that could actually be a host: it needs a dot and no whitespace.
    if (!/^[^\s/]+\.[^\s/]+/.test(host)) return trimmed
    return `https://${host}`
}

/**
 * Move a row, for drag-to-reorder.
 *
 * The array's order **is** the display order on the public profile, so this is a real edit and not
 * a view concern — which is also why it lives here with the rest of the diff logic rather than in
 * the component. Out-of-range indexes return the list untouched: a drag that ends outside the
 * group should do nothing, not throw.
 */
export function moveSocialLink(
    links: SocialLinkDraft[],
    from: number,
    to: number,
): SocialLinkDraft[] {
    if (from === to) return links
    if (from < 0 || to < 0 || from >= links.length || to >= links.length) return links
    const next = [...links]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

/** The indexes of the social rows that are not usable, so the editor can mark exactly those. */
export function invalidSocialRows(links: SocialLinkDraft[]): number[] {
    const bad: number[] = []
    links.forEach((link, index) => {
        if (!link.platform) bad.push(index)
        else if (!isValidLinkUrl(link.url)) bad.push(index)
    })
    return bad
}

/**
 * The latest date of birth an account may claim — today minus 18 years, as `YYYY-MM-DD`.
 *
 * Passed to the picker's `max`, which `DateField` **enforces** (it disables later days), and used
 * again by `dateOfBirthError` so a value that arrives some other way is checked too.
 *
 * ## The 29 February rollover
 *
 * `setFullYear(y - 18)` on 29 Feb targets a non-leap year, and JS rolls the date *forward*: on
 * 29 Feb 2028 it produced `2010-03-01` instead of `2010-02-28`, so 1 March 2010 stayed selectable and
 * `dateOfBirthError` passed it (`'2010-03-01' > '2010-03-01'` is false) — an account 17 years and 364
 * days old cleared the 18-year gate. One day in every four years, which is exactly the kind of bug
 * that ships.
 *
 * Clamped by setting the day *after* the year, which is the standard fix: a rollover is detectable
 * because the month changes, and 28 Feb is the last day of the target February.
 */
export function maxDateOfBirth(today: Date = new Date()): string {
    const date = new Date(today)
    const month = date.getMonth()
    date.setFullYear(date.getFullYear() - MIN_AGE_YEARS)
    // Rolled over into the next month: pull it back to the last day of the intended one.
    if (date.getMonth() !== month) date.setDate(0)
    return toDateInputValue(date)
}

/** `Date` → `YYYY-MM-DD` in **local** time. `toISOString` would shift a UTC-negative day back. */
export function toDateInputValue(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Why the date of birth is unusable, as a translation key — or `null`.
 *
 * Empty is not an error: the field is optional, and an account that never set one is the normal
 * state. Legacy seeds the picker with "18 years ago today" instead, which quietly writes a date
 * of birth nobody chose the first time anything else on the form is saved.
 */
export function dateOfBirthError(value: string, today: Date = new Date()): string | null {
    if (!value) return null
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return 'profile_dob_invalid'
    if (value > maxDateOfBirth(today)) return 'profile_dob_too_young'
    return null
}

// ── the diff ──────────────────────────────────────────────────────────────────────────────

/** Trimmed, `null`-safe comparison — `''`, `null` and `'  '` are all "no value". */
function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
    return (a ?? '').trim() === (b ?? '').trim()
}

function sameStringList(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameLinks(a: SocialLinkDraft[], b: SocialLinkDraft[]): boolean {
    return (
        a.length === b.length &&
        a.every(
            (link, index) =>
                link.platform === b[index].platform && sameText(link.url, b[index].url),
        )
    )
}

/**
 * Whether the images differ — and it asks about the **video** by identity, not by value.
 *
 * A pending crop is a fresh `blob:` URL, so a changed picture always changes the string. The
 * avatar video is the awkward one: it is an object that came from the server, and the only two
 * things that can happen to it are being replaced (a new `File` exists, which the caller knows)
 * or being removed (it becomes `null`). Comparing it structurally would report "changed" for a
 * payload the backend re-serialised, and this comparison is what decides whether `images` — and
 * therefore a re-run of image moderation — is sent at all.
 */
function sameImages(a: ProfileImages, b: ProfileImages): boolean {
    return (
        sameText(a.thumb, b.thumb) &&
        sameText(a.cover, b.cover) &&
        Boolean(a.avatarVideo) === Boolean(b.avatarVideo) &&
        a.avatarVideo === b.avatarVideo
    )
}

/** Has anything on the form moved? Drives the Save button. */
export function isProfileDirty(initial: ProfileValues, values: ProfileValues): boolean {
    return !(
        sameText(initial.name, values.name) &&
        sameText(initial.slug, values.slug) &&
        sameText(initial.description, values.description) &&
        initial.dateOfBirth === values.dateOfBirth &&
        sameStringList(initial.categories, values.categories) &&
        sameLinks(initial.socialLinks, values.socialLinks) &&
        initial.showIncome === values.showIncome &&
        sameImages(initial.images, values.images)
    )
}

/**
 * Whether the form can be submitted at all — every local rule, in one place.
 *
 * Deliberately **not** "is every field perfect", in two separate ways.
 *
 * ## Only what the client can judge
 *
 * The name rules, the bio length, the date and a half-typed social row are all arithmetic on
 * values in the browser. Anything only the server can decide — a taken username, a blocked word,
 * a picture that fails moderation — is *not* gated here: a form that refuses to submit until the
 * server has approved a value it has not been sent is a form that cannot be submitted.
 *
 * ## Only what **changed**
 *
 * A field is judged against `initial` first, and an untouched one is never an error. This is not
 * leniency; it is the difference between a usable screen and a trap. A space whose stored name
 * is four characters — created before the rule, or by an importer, or by the app itself — would
 * otherwise make *every* save impossible until its owner also renamed it, including the save that
 * only fixed a typo in the bio. And the patch would not have carried `name` anyway
 * (`buildChannelPatch` sends the diff), so the rule would be blocking a field that was never
 * going to be sent.
 *
 * The date of birth is the exception and is always checked: it has no stored counterpart to
 * inherit a problem from (`accountDob` returns `null` for anything malformed), so anything wrong
 * with it was typed just now.
 */
export function profileFormErrors(
    values: ProfileValues,
    initial?: ProfileValues | null,
): {
    name?: string
    description?: string
    dateOfBirth?: string
    socialLinks?: number[]
} {
    const errors: ReturnType<typeof profileFormErrors> = {}
    const changed = (field: keyof ProfileValues) => !initial || !sameField(initial, values, field)

    if (changed('name') && nameRuleFailures(values.name).length > 0) {
        errors.name = 'profile_name_invalid'
    }
    if (changed('description') && values.description.length > DESCRIPTION_MAX) {
        errors.description = 'profile_about_too_long'
    }

    const dob = dateOfBirthError(values.dateOfBirth)
    if (dob) errors.dateOfBirth = dob

    if (changed('socialLinks')) {
        const rows = invalidSocialRows(values.socialLinks)
        if (rows.length > 0) errors.socialLinks = rows
    }
    return errors
}

/** Field-wise equality, for the three fields `profileFormErrors` gates on. */
function sameField(a: ProfileValues, b: ProfileValues, field: keyof ProfileValues): boolean {
    if (field === 'socialLinks') return sameLinks(a.socialLinks, b.socialLinks)
    return sameText(a[field] as string, b[field] as string)
}

/**
 * The request body — **only the fields that changed**, or `null` when none of them did.
 *
 * ## Why a diff and not the whole object
 *
 * Three of these fields have a cost attached to being written:
 *
 * - `slug` is rate-limited to one change per week. Re-sending the current one on a save that
 *   only fixed a typo in the bio could burn the allowance for a change the person has not made
 *   yet — and there is no way to give it back.
 * - `images` re-runs moderation on whatever it is given, so an unchanged avatar re-sent with a
 *   new cover is a second chance to be told a picture that has been live for a year is
 *   sensitive.
 * - `show_income` publishes a number. It should move when it is moved, not when a form is saved.
 *
 * Legacy builds the same diff for the same reason, field by field, inline in its save handler.
 * Pulling it out here is what makes it testable, and the tests are where the rules above are
 * actually pinned.
 *
 * `images` is the one field sent **whole**. The endpoint replaces the object rather than merging
 * into it, so a patch carrying only `cover` clears the avatar. The caller passes the complete
 * trio; this only decides whether to include it.
 *
 * `dateOfBirth` is **not** in the result: it lives on `/me`, not on the channel, so it is a
 * separate write the caller makes through `useUpdateMe`. It is still compared in
 * `isProfileDirty`, because the Save button covers the whole form.
 */
export function buildChannelPatch(
    initial: ProfileValues,
    values: ProfileValues,
): ChannelPatch | null {
    const patch: ChannelPatch = {}

    if (!sameText(initial.name, values.name)) patch.name = values.name.trim()
    if (!sameText(initial.slug, values.slug)) patch.slug = values.slug.trim()
    if (!sameText(initial.description, values.description)) {
        patch.description = values.description.trim()
    }
    if (!sameStringList(initial.categories, values.categories)) {
        patch.categories = [...values.categories]
    }
    if (!sameLinks(initial.socialLinks, values.socialLinks)) {
        patch.social_links = values.socialLinks.map(link => ({
            platform: link.platform,
            title: link.title,
            url: link.url.trim(),
        }))
    }
    if (initial.showIncome !== values.showIncome) patch.show_income = values.showIncome
    if (!sameImages(initial.images, values.images)) {
        patch.images = {
            thumb: values.images.thumb,
            cover: values.images.cover,
            avatar_video: values.images.avatarVideo ?? null,
        }
    }

    return Object.keys(patch).length > 0 ? patch : null
}

// ── uploads ───────────────────────────────────────────────────────────────────────────────

/*
 * `fileExtension`, `UploadKind` and `uploadKey` moved to `@shared/lib/api/upload-key` when a second
 * feature needed to name an object and could not import this one — see that file's header. They are
 * re-exported here so this feature's own call sites are unchanged, and because a bucket-key shape
 * shared with a shipped app should have exactly one definition.
 */
export {
    fileExtension,
    type UploadKind,
    uploadKey,
} from '@shared/lib/api/upload-key'
