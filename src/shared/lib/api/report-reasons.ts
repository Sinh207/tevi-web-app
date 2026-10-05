import { z } from 'zod'

/**
 * The shape of a report reason, and how one becomes a label — shared by every surface that can be
 * reported.
 *
 * ## Why this is shared, and by whose instruction
 *
 * `features/channel/api/report-api.ts` says it out loud: legacy has four more reason lists beside
 * the space one (`post`, `comment`, `livestream`), and *"the others land with the surfaces that
 * open them, in whichever feature owns those."* `features/post` owns the post card and the comment
 * row, so it files those two — and it cannot import `features/channel`, because the dependency
 * between them runs channel → post. Without this module the second implementer copies the schema
 * and the label fallback, which is a copy of the one thing in the flow that must not drift: the
 * fallback is what keeps a reason the backend ships *after* this client selectable at all.
 *
 * Each feature still owns its **paths** and its own copy keys. Only the row shape and the naming
 * rule are here.
 */

/**
 * A reason: a **stable id** and the backend's own wording of it.
 *
 * ```json
 * { "type": "CHANNEL_SEXUAL_CONTENT", "text": "Sexual content" }
 * ```
 *
 * `type` is what gets filed — legacy posts `content?.type`, never the prose — and it is also what
 * makes the list translatable: `reasonLabelKey` maps the id to this app's own copy and `text` stands
 * behind it for an id that ships after this client. Legacy instead loads the whole English resource
 * bundle and reverse-looks-up each row's English string to find its key
 * (`formReport/content`: `Object.keys(bundle).find(k => bundle[k] === text)`), which silently falls
 * back to English the day anyone edits a translation.
 *
 * A row without a `type` is dropped rather than shown: it could be displayed, but it could not be
 * *submitted*, and a radio that cannot be chosen is worse than a shorter list.
 */
export const reasonSchema = z.looseObject({
    type: z.string().min(1),
    text: z
        .unknown()
        .transform(v => (typeof v === 'string' && v.trim() ? v.trim() : ''))
        .catch(''),
})

export type ReportReason = z.infer<typeof reasonSchema>

/**
 * One page of reasons, with unparseable rows dropped and the backend's order kept.
 *
 * The order is the backend's on purpose — a moderation list is ranked by how often each reason is
 * chosen, and re-sorting it here would put the rare reasons in front of the common ones.
 */
export function normalizeReasons(body: unknown): ReportReason[] {
    if (!Array.isArray(body)) return []
    return body.flatMap(row => {
        const parsed = reasonSchema.safeParse(row)
        return parsed.success ? [parsed.data] : []
    })
}

/**
 * The translation key for a reason id.
 *
 * `reasonLabelKey('CHANNEL_SEXUAL_CONTENT', { keyPrefix: 'channel_report_reason', stripPrefix:
 * 'CHANNEL_' })` → `channel_report_reason_sexual_content`.
 *
 * `stripPrefix` exists because the ids are namespaced by surface (`CHANNEL_`, and per **B111**
 * probably `POST_` / `REPLY_`) while the copy is not — the same reason spelled twice would be two
 * keys for one sentence in nine locales. It takes a list, so a surface whose endpoint namespaces
 * inconsistently needs no second function.
 *
 * The returned key is **not** typed `TranslationKey`: the ids come off the wire, so a key that does
 * not exist is an ordinary outcome rather than a typo, and that is exactly the case the caller
 * handles by falling back to the row's own `text`. Typing it would force a cast at every call site
 * and buy nothing.
 */
export function reasonLabelKey(
    type: string,
    { keyPrefix, stripPrefix = [] }: { keyPrefix: string; stripPrefix?: readonly string[] },
): string {
    const stripped = stripPrefix.reduce(
        (value, prefix) => (value.startsWith(prefix) ? value.slice(prefix.length) : value),
        type,
    )
    return `${keyPrefix}_${stripped.toLowerCase()}`
}
