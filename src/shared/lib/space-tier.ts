/**
 * The space-tier badge to draw beside a channel's name, or `null`.
 *
 * Shared because two features draw it from two payloads — the post header (`features/post`, the
 * channel embedded in a post) and the Following list (`features/channel`, the followed-channel
 * projection) — and neither may import the other. Two copies of the gate below would disagree the
 * first time one of them is "simplified" to the image check, so it is written once. The parameter
 * is **structural** for the same reason: each schema declares the pair itself, and a renamed field
 * is a type error at that call site.
 *
 * ## Tier 0 is a tier, and it has no badge
 *
 * Legacy's `BadgeSpaceTier` bails on `!image || !Number.isFinite(tier) || tier <= 0`, and the last
 * clause is the one worth porting carefully: every channel has a `space_tier`, most of them are `0`,
 * and the backend still sends a `space_tier_image` alongside it. Gate on the image alone — which is
 * the obvious reading — and every ordinary channel wears a tier-1 badge it has not earned.
 *
 * Returning the image rather than a boolean keeps the two checks in one place; a caller that gets a
 * string has already been told it may draw.
 */
export function spaceTierBadge(
    channel: {
        space_tier?: number | null
        space_tier_image?: string | null
    } | null,
): string | null {
    if (!channel?.space_tier_image) return null
    const tier = channel.space_tier
    if (tier === null || tier === undefined || !Number.isFinite(tier) || tier <= 0) return null
    return channel.space_tier_image
}
