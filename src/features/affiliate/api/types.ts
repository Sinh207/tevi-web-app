import { z } from 'zod'

/**
 * The `raffi` service's DTOs — an affiliate program, the campaign the account is currently
 * promoting, and its running totals.
 *
 * `looseObject` throughout: the service carries more per program than these screens read, and a
 * strict schema would reject a row the day a field is added.
 *
 * **The money and rate fields are strings on the wire.** Legacy runs `estimate_income`,
 * `total_earnings` and `commission_rate` through `parseFloat` / `Number` at every call site; they
 * are parsed once here instead, and a value that will not parse becomes `null` rather than `NaN`
 * leaking into a formatter.
 */

/** Whatever the wire sends for a number — a string, a number, or nothing. */
const numeric = z
    .union([z.number(), z.string()])
    .nullish()
    .catch(null)
    .transform(value => {
        if (value === null || value === undefined || value === '') return null
        const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : null
    })

const nullableText = z
    .string()
    .nullish()
    .catch(null)
    .transform(value => value ?? null)

/**
 * A program's id. The wire has been seen sending both a number and a string, and it is only ever
 * compared and sent back, never arithmetic — so it is normalised to a string and compared as one.
 * Legacy compares with `!=` / `!==` against a raw wire value, which is how `1 !== '1'` becomes a
 * "switch" the user never asked for.
 */
const programId = z.union([z.number(), z.string()]).transform(String)

export const programSchema = z.looseObject({
    id: programId,
    name: nullableText,
    /** The mini app's own page. Opened in a new tab from the "View X" chip and the ⋯ menu. */
    url: nullableText,
    icon_url: nullableText,
    /** A percentage, as a bare number: `12` means 12%. */
    commission_rate: numeric,
    /** Monthly revenue estimate, in USD. The list already carries it, so no `/estimate/` call. */
    estimate_income: numeric,
    promoter_count: numeric,
})

export type Program = z.infer<typeof programSchema>

/**
 * The campaign the account is promoting right now, or `null` when it is promoting nothing.
 *
 * `program` is what says "joined" — `currentCampaign.program.id` is the whole notion of which
 * program is active, and the list, the detail's switch/join decision and the ⋯ menu all read it.
 */
export const currentCampaignSchema = z.looseObject({
    program: programSchema
        .nullish()
        .catch(null)
        .transform(v => v ?? null),
    /** The account's tracked link for the program it is promoting. */
    referral_url: nullableText,
})

export type CurrentCampaign = z.infer<typeof currentCampaignSchema>

export const campaignStatsSchema = z.looseObject({
    /** Referred users. Legacy calls them "Players". */
    referee_count: numeric,
    total_earnings: numeric,
})

export type CampaignStats = z.infer<typeof campaignStatsSchema>

/**
 * A page of programs.
 *
 * A row that will not parse is dropped and the page is kept — the rule `events-api.ts` had to
 * learn, where an array-level `.catch([])` turned one odd row into an empty list.
 */
export function normalizePrograms(body: unknown): Program[] {
    const raw = body as { results?: unknown } | null
    const rows = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : []
    return rows
        .map(row => programSchema.safeParse(row))
        .filter(r => r.success)
        .map(r => r.data)
}

/**
 * `campaigns/current/` answers the campaign body, or something empty when there is none.
 *
 * `null` and `{}` both mean "promoting nothing", and so does a body whose `program` did not parse:
 * a campaign with no identifiable program cannot be displayed, switched away from or left, so
 * treating it as absent is the only state the screens can act on.
 */
export function normalizeCurrentCampaign(body: unknown): CurrentCampaign | null {
    const parsed = currentCampaignSchema.safeParse(body)
    if (!parsed.success) return null
    return parsed.data.program ? parsed.data : null
}

export function normalizeStats(body: unknown): CampaignStats | null {
    const parsed = campaignStatsSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/**
 * What `campaigns/join/` answers. The program is folded in from the request when the response omits
 * it — legacy does the same, because the screen that follows is identified by the program the user
 * pressed, not by whatever the write echoed back.
 */
export interface JoinResult {
    program: Program
    referralUrl: string | null
}
