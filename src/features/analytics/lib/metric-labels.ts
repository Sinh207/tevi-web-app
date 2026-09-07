/**
 * A metric's name on screen.
 *
 * ## Why a map at all, when the payload carries a `description`
 *
 * `channel/stats/` sends an English `description` per metric ("Total Revenue"). It is the only
 * label the backend has, and it is not translated — so a Vietnamese creator reading a Vietnamese
 * dashboard would find every tab in English. The map turns the wire **name** into one of our own
 * keys and the `description` becomes the fallback for a metric that ships after this client, which
 * is the right way round: a new metric appears in English rather than not at all.
 *
 * ## Keyed on `name`, not on `id`
 *
 * The wire `name` is the stable slug (`total_revenue`); `id` is a row id from the metrics table and
 * differs per environment. Legacy keys this map on `name` in one place and on `id` in two others
 * (`metricTab`, `metricChart`), so on its own screen the tab strip is translated and the chart's
 * heading above it is not. Same lookup, one function, no second spelling.
 */

import type { ChannelStatMetric } from '../api/types'

/** Wire `name` → translation key. Adding a metric is one line; nothing else changes. */
const METRIC_LABEL_KEYS: Record<string, string> = {
    total_revenue: 'analytics_metric_total_revenue',
    livestream_revenue: 'analytics_metric_livestream_revenue',
    membership_revenue: 'analytics_metric_membership_revenue',
    direct_donation_revenue: 'analytics_metric_direct_donation_revenue',
    interaction_revenue: 'analytics_metric_interaction_revenue',
    game_referral_revenue: 'analytics_metric_game_referral_revenue',
    post_revenue: 'analytics_metric_post_revenue',
    live_sessions: 'analytics_metric_live_sessions',
    number_of_donors: 'analytics_metric_number_of_donors',
    new_members: 'analytics_metric_new_members',
    followers: 'analytics_metric_followers',
    unfollowers: 'analytics_metric_unfollowers',
}

/** What a metric is called, in the reader's language where we have a word for it. */
export function metricLabel(
    metric: Pick<ChannelStatMetric, 'name' | 'description' | 'id'>,
    t: (key: string) => string,
): string {
    const key = METRIC_LABEL_KEYS[metric.name]
    // `t` returns the key itself when it is missing, which would print `analytics_metric_…` on
    // screen. The map is the only source of keys here, so that can only happen if a key was added
    // to this file and not to the locales — the fallback keeps that a wrong *word*, not a slug.
    if (key) {
        const translated = t(key)
        if (translated && translated !== key) return translated
    }
    return metric.description || metric.name || metric.id
}
