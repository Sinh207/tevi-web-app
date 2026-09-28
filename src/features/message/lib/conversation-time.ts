/**
 * The time beside a conversation — legacy's ladder (`timeLatestMessage/index.js`), spoken by `Intl`
 * rather than by seven translation keys.
 *
 * | Age                       | Shows        |
 * |---------------------------|--------------|
 * | under a minute            | now          |
 * | under an hour             | 5 min. ago   |
 * | under a day               | 3 hr. ago    |
 * | the calendar day before   | yesterday    |
 * | within the last week      | Tue          |
 * | this year                 | Mar 4        |
 * | older                     | 3/4/2024     |
 *
 * Legacy's own keys cannot carry this: its "minutes ago" string is `dm_w2_ss_ago`, translated in
 * every locale as **seconds** ago (`[%s] giây trước`), so the list tells a Vietnamese reader a
 * message from forty minutes ago arrived forty seconds ago. `Intl.RelativeTimeFormat` has the unit
 * right in every locale this app ships, and pluralises Arabic without a key per form.
 *
 * Legacy checks "under 24 hours" *before* "yesterday", so a message from 11pm read at 9am says
 * "10h ago" rather than "yesterday" — that order is kept, since it is what the apps show too.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function relative(locale: string): Intl.RelativeTimeFormat {
    try {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
    } catch {
        return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })
    }
}

function date(value: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
    try {
        return new Intl.DateTimeFormat(locale, options).format(value)
    } catch {
        return new Intl.DateTimeFormat('en', options).format(value)
    }
}

function startOfDay(time: number): number {
    const day = new Date(time)
    day.setHours(0, 0, 0, 0)
    return day.getTime()
}

export function formatConversationTime(
    time: number | null,
    locale = 'en',
    now: number = Date.now(),
): string {
    if (time === null || !Number.isFinite(time)) return ''
    const elapsed = now - time
    const format = relative(locale)

    // A clock a little ahead of ours is "now", not "in 2 minutes".
    if (elapsed < MINUTE) return format.format(0, 'second')
    if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), 'minute')
    if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), 'hour')

    const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY)
    if (days === 1) return format.format(-1, 'day')

    const value = new Date(time)
    if (days < 7) return date(value, locale, { weekday: 'short' })
    if (value.getFullYear() === new Date(now).getFullYear()) {
        return date(value, locale, { day: 'numeric', month: 'short' })
    }
    return date(value, locale, { day: 'numeric', month: 'numeric', year: 'numeric' })
}
