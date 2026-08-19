import { z } from 'zod'

/**
 * The three campaign kinds the rail asks for, as the wire spells them.
 *
 * They are sent as **repeated** `campaign_type` parameters on one request, so the rail makes a
 * single call and picks its three cards out of the result rather than one call per card.
 */
export const CAMPAIGN_TYPES = ['LUCKY_WHEEL', 'MILESTONE', 'AFFILIATE'] as const
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]

/** `.catch(false)` so a campaign with a malformed flag is off, never on. */
const boolish = z.coerce.boolean().catch(false)

/** Optional and absent both collapse to `null`, so consumers write one check. */
function nullableText() {
    return z
        .string()
        .nullish()
        .catch(null)
        .transform(v => v ?? null)
}

/**
 * One campaign, as `dapp-campaign/v1/campaigns/` returns it.
 *
 * `looseObject` on purpose — the service carries far more per campaign than the rail reads, and a
 * strict schema would reject a row the day a field is added. Only what a card renders is declared.
 *
 * **`total_reward_in_usdt` is a string on the wire**, not a number: legacy runs it through
 * `parseFloat` at both call sites. Kept as the wire type here and parsed once, in `campaignReward`.
 */
const campaignSchema = z.looseObject({
    campaign_type: z.enum(CAMPAIGN_TYPES),
    is_active: boolish,
    name: nullableText(),
    description: nullableText(),
    /** Grow-Your-Fans: the destination. The card does not render without it. */
    shortlink: nullableText(),
    /** Affiliate: the program's own mark, which overrides the bundled fallback. */
    logo: nullableText(),
    total_reward_in_usdt: nullableText(),
    user_joined: boolish,
    /** Grow-Your-Fans prefers these over `name` / `description` when the milestone supplies them. */
    milestone_details: z
        .looseObject({ title: nullableText(), subtitle: nullableText() })
        .nullish()
        .catch(null)
        .transform(v => v ?? null),
})

export type Campaign = z.infer<typeof campaignSchema>

/**
 * The three campaigns, keyed by kind — `null` for one the service did not return.
 *
 * A record rather than the wire's array because every consumer wants exactly one kind. Legacy
 * does the same with three `results.find(...)` calls, once per kind, on every render.
 */
export type CampaignsByType = Record<CampaignType, Campaign | null>

export const EMPTY_CAMPAIGNS: CampaignsByType = {
    LUCKY_WHEEL: null,
    MILESTONE: null,
    AFFILIATE: null,
}

/**
 * A row that will not parse is dropped; the response is not.
 *
 * The rule `events-api.ts` had to learn the hard way — an array-level `.catch([])` turns one odd
 * row into an empty list, so a single malformed campaign would blank all three cards.
 */
export function normalizeCampaigns(body: unknown): CampaignsByType {
    const raw = body as { results?: unknown } | null
    const rows = Array.isArray(raw?.results) ? raw.results : []
    const out: CampaignsByType = { ...EMPTY_CAMPAIGNS }

    for (const row of rows) {
        const parsed = campaignSchema.safeParse(row)
        if (!parsed.success) continue
        // First one wins: the service returns at most one campaign per kind, and if it ever
        // returns two, the earlier row is the one legacy's `find` would have taken.
        out[parsed.data.campaign_type] ??= parsed.data
    }

    return out
}

/**
 * The reward figure as a number, or `null` when there is nothing to show.
 *
 * Legacy writes `parseFloat(...)` then `if (!amount || Number.isNaN(amount)) return ''` twice,
 * which quietly makes **zero** mean "no reward" as well as "zero reward". Kept, because a campaign
 * advertising `$0.00` is a worse card than one with no reward line — but stated rather than implied.
 */
export function campaignReward(campaign: Campaign | null): number | null {
    const amount = Number.parseFloat(campaign?.total_reward_in_usdt ?? '')
    if (!Number.isFinite(amount) || amount === 0) return null
    return amount
}
