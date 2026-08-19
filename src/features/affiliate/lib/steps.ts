/**
 * The dialog's three screens.
 *
 * A flat union rather than a stack, because the depth is genuinely one: every screen returns to the
 * list, never to whichever screen preceded it. `features/navigation`'s drawer models its own screens
 * the same way (`DrawerView`), and its note applies here too — an array stack would be machinery
 * for a "back" that has only one destination.
 *
 *   list    every program on offer, plus a card for the one being promoted
 *   detail  the join / switch pitch for a program that was pressed
 *   joined  the referral link, the running totals and the way out
 */
export const AFFILIATE_STEPS = ['list', 'detail', 'joined'] as const

export type AffiliateStep = (typeof AFFILIATE_STEPS)[number]
