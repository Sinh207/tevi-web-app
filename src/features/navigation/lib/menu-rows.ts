/*
 * `@features/<x>/routes`, **not** the feature barrels. Each of those pulls in a screen view, which
 * reaches back into `features/channel` — a cycle between barrels that ESM resolves by handing one
 * side a half-initialised module. Both files are import-free for exactly this reason; see their
 * docs. Same rule, same shape, as `channel-owner-actions.tsx`'s import of `@features/earnings/routes`.
 *
 * The balance *figure* on the My Star row does not come from here — `menu-drawer.tsx` reads it from
 * `features/balance`'s provider, which is what keeps this file JSX-free and hook-free.
 */
import { DASHBOARD_ANALYTICS_PATH } from '@features/analytics/routes'
/*
 * The channel feature keeps its paths in `lib/routes.ts` rather than in a top-level `routes.ts`,
 * so this import reaches one level deeper than its siblings — the same spelling `menu-active.ts`
 * already uses, and for the same reason: that file is import-free, and going through
 * `@features/channel` would pull a screen into this data module and close the barrel cycle the
 * docstring above describes.
 */
import { FOLLOW_REQUESTS_PATH, MCN_PARTNERSHIP_PATH } from '@features/channel/lib/routes'
import { GIFT_CODE_PATH } from '@features/gift-code/routes'
import { IDENTIFICATION_PATH } from '@features/identification/routes'
import { MY_MEMBERSHIP_PATH } from '@features/membership/routes'
import { MONETIZATION_PATH } from '@features/monetization/routes'
import { MY_STAR_PATH } from '@features/my-star/routes'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
import { CARD_MANAGEMENT_PATH, GET_STAR_PATH } from '@features/payment/routes'
import type { Capability } from '@features/permission'
import { BOOKMARKS_PATH } from '@features/post/routes'
import { GIFT_PREMIUM_PATH, PREMIUM_PATH } from '@features/premium/routes'
import { STAR_TRANSFER_PATH } from '@features/star-transfer/routes'
import type { IconProps } from '@shared/ui/icon'
import type { DrawerView } from '../providers/menu-state'
import { TILE } from './menu-tiles'

/**
 * What the account drawer lists — the rows, their order, and where each one goes.
 *
 * Data only: no JSX, no hooks, so the drawer's markup is not 300 lines of config away from
 * the logic that renders it. `menu-drawer.tsx` turns each row into a `LeftBarRow` and decides
 * what pressing it does (`rowAction`).
 */

export type Row = {
    /** Translation key, `menu_<slug>`. */
    key: string
    /**
     * Overrides the row's `data-testid` leaf, which otherwise falls back to `key` without its
     * `menu_` prefix (see `menuRowTestId`).
     *
     * The fallback exists so no row is unlabelled, but it is a fallback and not the design: a testid
     * derived from a translation key couples QC's selectors to a translation-key rename, which this
     * repo does. Once an id is published in `testids/lock.json`, a key rename that moves the derived
     * id fails CI — and the fix at that point is to pin it here, not to rename it downstream.
     */
    testId?: string
    icon?: IconProps
    tile?: string
    glyph?: string
    /**
     * Runs in place instead of going anywhere — the row keeps its chevron off, since
     * there is nothing to drill into.
     */
    action?: 'sign-out' | 'switch-account' | 'mini-app-center'
    /**
     * A 32px brand mark in place of the coloured tile. `premium--filled` is the one
     * multi-colour glyph in the sprite — hardcoded hexes plus a gradient, so it
     * ignores `currentColor` and brings its own paint. Putting it on a tile muddies
     * both; the reference comp gives that row a bare 32px mark, so this does too.
     */
    mark?: IconProps
    /** A right-hand value, e.g. the current language. */
    value?: string
    /** Literal right-hand value that is not a translation key. */
    valueText?: string
    /** Push a sub-screen instead of navigating. */
    view?: DrawerView
    /**
     * Hide the row entirely while there is no real account, rather than showing it and gating
     * the press.
     *
     * **This is legacy's own table**, row for row: `iconBtnMenu/menu/content/index.js` marks all
     * but seven of its entries `allowed: isAuthenticated`, so a signed-out drawer there is the
     * profile prompt plus Language / Other settings / Send feedback / Report an issue. What a
     * guest sees here is the same set, plus the two rows legacy has no equivalent for (Appearance
     * and Data and storage, both of which configure the *browser* and work perfectly well with no
     * session) and the FAQ link.
     *
     * It does **not** contradict `CLAUDE.md`'s "gate the action, never the route" — that rule is
     * about what happens when somebody *presses* something, and about never redirecting a dead
     * session away from what it was reading. This is a **list**, and `features/permission` already
     * states the trade for a list in the `capability` note below: an unlisted row costs nothing.
     * The routes stay public where they were public — `/premium` and `/redeem-gift-code` still
     * render and still explain themselves to a guest who arrives by link, they are just not
     * advertised in a menu where every neighbouring row would raise a sign-in dialog.
     *
     * A row keeps its `requiresAuth` alongside this: the two answer different questions ("is it
     * listed" vs "what does pressing it do"), and the press gate is what still holds during the
     * bootstrap window, where the drawer deliberately shows the signed-in set (see `menu-drawer`).
     */
    authOnly?: boolean
    /**
     * Gate the **action** rather than the route: pressing it while signed out raises the
     * sign-in dialog instead of pushing. Legacy does the same on this row
     * (`btnPrivacyAndSecurity` calls `openDialog('login')`), and it is the app's rule
     * everywhere — a dead session never redirects, so whatever is on screen stays.
     */
    requiresAuth?: boolean
    /**
     * Hide the row unless the backoffice has switched this feature on for the account.
     *
     * `menu-drawer` filters on `can(capability)`, which **fails closed** — an unknown grant hides the
     * row. That is the right trade for a *list*, and `features/permission` says so: an unlisted row
     * costs nothing, where a listed one leads to a screen the backend would refuse. A screen wants
     * `useCapability`'s four states instead, which is what `/star-transfer` itself uses.
     */
    capability?: Capability
    /**
     * Hide the row unless this account is **managed by** a multi-channel network.
     *
     * The third kind of gate in this table, and it is neither of the other two: `authOnly` asks
     * whether there is an account and `capability` asks what the backoffice switched on, while this
     * asks about a *fact in the account's own body* — `my-channel/`'s `mcn` block. Legacy gates the
     * row on exactly that, and on the same two halves:
     * `isAuthenticated && Boolean(myChannel?.mcn) && !myChannel.mcn.is_owner`.
     *
     * **Both halves matter.** A creator with no network has nothing to read there, and the *operator*
     * of one (`is_owner`) is excluded too: the screen shows the split a managed creator is paid
     * under, which an owner does not negotiate with themselves, and its one action — leaving —
     * is not something they can do to their own organization. `/mcn-partnership` shows both of them
     * its empty state, so the row and the screen agree.
     *
     * Like `capability`, this **fails closed**: while `my-channel/` is unanswered the row is hidden
     * rather than shown and taken away. The route stays reachable at its own URL for anyone who has
     * it bookmarked, which is the trade `authOnly` writes down — an unlisted row costs nothing.
     */
    mcnOnly?: boolean
    /** Where the row goes. Only set it once the route exists — see `navigate`. */
    href?: string
    /** Leaves the app: the trailing chevron becomes an open-in-new glyph. */
    external?: boolean
}

/**
 * The drawer's root screen — eight sections, 23 rows, fixed order. The **profile** figures are
 * still placeholders; the balance ones are live as of `features/balance` (the card's STAR/USD
 * values and the My Star row's trailing figure). A row with an `href` is a real link that
 * navigates; the rest stay inert `<button>`s — real, so they are keyboard-reachable, but with
 * nothing behind them until their destination exists.
 *
 * Tevi Coin and Tevi features are dropped: both are authored with a raster app mark,
 * and the DS export ships **one placeholder PNG for all three** rather than the real
 * marks. Add them back when the real assets exist. Tevi Premium stayed and took the
 * sprite's `premium` glyph — Figma leaves its tile empty and the comp fills it with a
 * crown PNG we do not have either, and **Mini App Center** is back on the same terms:
 * a sprite glyph on a coloured tile instead of the missing mark, now that
 * `features/mini-app` gives the row somewhere to go.
 *
 * **Signed out, most of this is not listed at all** — see `authOnly`. What is left is the
 * profile card's sign-in prompt, Appearance / Language / Data and storage / Other settings, and
 * the three help rows a guest can actually use; every section that loses all of its rows loses
 * its heading with them (`menu-drawer`). That is legacy's own table, and the reasoning — why it
 * is not in tension with "gate the action, never the route" — is on the flag.
 */
/**
 * A row's `data-testid` leaf: its explicit `testId`, else `key` minus the `menu_` prefix.
 *
 * `key` is a translation key (`menu_get_star`) — a code-authored slug, so it is safe as *identity*;
 * what it must not become is the selector verbatim, which is why the prefix is stripped and why
 * `Row.testId` exists to override it. The caller prefixes its own scope, so the drawer's rows come
 * out as `navigation-menu-row-get-star`.
 */
export function menuRowTestId(row: Row): string {
    return row.testId ?? row.key.replace(/^menu_/, '').replace(/_/g, '-')
}

export const MENU_SECTIONS: {
    label: string
    inset: boolean
    featured?: boolean
    rows: Row[]
}[] = [
    {
        label: 'menu_section_power_ups',
        inset: true,
        featured: true,
        rows: [
            {
                key: 'menu_get_more_star',
                authOnly: true,
                icon: { name: 'star', weight: 'filled' },
                tile: TILE.title,
                glyph: 'var(--accents-yellow)',
                href: GET_STAR_PATH,
            },
            {
                key: 'menu_tevi_premium',
                authOnly: true,
                mark: { name: 'premium', weight: 'filled' },
                /*
                 * A real link, and **not** gated on the action: `/premium` is the page that explains
                 * what Premium is, so anybody who reaches it should read it rather than be asked to
                 * sign in first. The screen gates the *Subscribe press* instead — this app's rule
                 * everywhere (`docs/DEFINITION_OF_DONE.md` §3).
                 *
                 * `authOnly` is about the *listing*, not the route, and legacy marks this row
                 * `allowed: isAuthenticated` too: the page stays open to anyone who arrives by link
                 * or from `/premium`'s own entry points, it simply is not advertised in a drawer
                 * whose whole Power-ups section is otherwise account-scoped.
                 */
                href: PREMIUM_PATH,
            },
            {
                key: 'menu_gift_premium',
                authOnly: true,
                icon: { name: 'gift-simple', weight: 'filled' },
                tile: TILE.warning,
                /*
                 * The row that was here without an `href` until `/gift-premium` existed — a heading
                 * with no destination, which is the shape this table's own note argues against ("a
                 * row pointing at a 404 is worse than no row"). It has one now.
                 *
                 * `requiresAuth` is **not** set, for the reason the Premium row above gives at
                 * length and the redeem row below repeats: the screen gates the *press*
                 * (`useGiftPremium.request` composes `useRequireAuth`), the picker itself is
                 * readable, and raising a dialog from a drawer row for a page a guest can use is
                 * the behaviour `docs/DEFINITION_OF_DONE.md` §3 rules out. `authOnly` still hides
                 * it from a guest's drawer, which is a different question and the one legacy
                 * answers with `allowed: isAuthenticated`.
                 */
                href: GIFT_PREMIUM_PATH,
            },
        ],
    },
    {
        label: 'menu_section_assets',
        inset: true,
        rows: [
            {
                key: 'menu_my_wallet',
                authOnly: true,
                icon: { name: 'wallet', weight: 'filled' },
                tile: TILE.indigo,
                href: MY_WALLET_PATH,
                /*
                 * Gated on the *action*, like Identification above: pressing it signed out raises
                 * the sign-in dialog instead of navigating, so whatever the visitor was reading
                 * stays put. `/my-wallet` does render for a guest — it shows a sign-in prompt — but
                 * the only thing a guest could do there is press a button that raises this same
                 * dialog one screen later.
                 */
                requiresAuth: true,
            },
            {
                key: 'menu_my_star',
                authOnly: true,
                icon: { name: 'star', weight: 'filled' },
                tile: TILE.warning,
                href: MY_STAR_PATH,
                requiresAuth: true,
                /*
                 * The row carries the live Star figure on its right, per the design's own dev note
                 * (*"thêm 1 tab trong phần asset là My Star, hiển thị số dư Star ở đây luôn"*).
                 *
                 * `value` is a translation key everywhere else in this table, so the empty string
                 * marks "this row has a trailing value, and it is not a key" — `menu-drawer`'s
                 * `rowTrailing` substitutes the balance, exactly as it already does for Appearance,
                 * Language and Identification. The three of them are why that mechanism exists.
                 */
                value: '',
            },
            {
                key: 'menu_card_management',
                authOnly: true,
                icon: { name: 'address-card', weight: 'filled' },
                tile: TILE.success,
                href: CARD_MANAGEMENT_PATH,
                requiresAuth: true,
            },
        ],
    },
    {
        label: 'menu_section_creators',
        inset: true,
        rows: [
            {
                key: 'menu_dashboard_analytics',
                authOnly: true,
                icon: { name: 'chart-column-alt', weight: 'filled' },
                tile: TILE.indigo,
                href: DASHBOARD_ANALYTICS_PATH,
                /*
                 * Gated on the *action*, like My Wallet above: every request the screen makes is
                 * bearer-derived, so a guest pressing it would arrive at a sign-in prompt. Raising
                 * the dialog here leaves whatever they were reading in place.
                 */
                requiresAuth: true,
            },
            {
                key: 'menu_monetization',
                authOnly: true,
                icon: { name: 'dollar-sign', weight: 'filled' },
                tile: TILE.success,
                href: MONETIZATION_PATH,
                /*
                 * Gated on the *action*, like every other creator row: the hub's figures are the
                 * bearer's channel stats and the bearer's balance, so a guest pressing it would
                 * arrive at a sign-in wall. Raising the dialog here leaves whatever they were
                 * reading in place.
                 */
                requiresAuth: true,
            },
            {
                key: 'menu_space_tier',
                authOnly: true,
                icon: { name: 'award', weight: 'filled' },
                tile: TILE.warning,
            },
            {
                key: 'menu_mcn_partnership',
                authOnly: true,
                icon: { name: 'document-list', weight: 'filled' },
                tile: TILE.warning,
                href: MCN_PARTNERSHIP_PATH,
                /*
                 * Listed only for a creator a network actually manages — legacy's own condition,
                 * spelled out on `Row.mcnOnly`. Most accounts never see this row.
                 */
                mcnOnly: true,
                /*
                 * Gated on the *action* as well, like every other creator row: the screen is
                 * `my-channel/` plus `v3/organization/leave/` as this bearer. The `mcnOnly` gate
                 * already hides it for a guest (no session, no `mcn`), so this is belt to those
                 * braces and costs nothing.
                 */
                requiresAuth: true,
            },
            {
                key: 'menu_follow_requests',
                authOnly: true,
                icon: { name: 'user-plus', weight: 'filled' },
                tile: TILE.indigo,
                href: FOLLOW_REQUESTS_PATH,
                /*
                 * Gated on the *action*, like every other creator row: the queue is
                 * `my-channel/follow-requests/` as this bearer, so a guest pressing it would
                 * arrive at a sign-in prompt. Raising the dialog here leaves whatever they were
                 * reading in place. The row also carries a badge — see `rowTrailing` in
                 * `menu-drawer.tsx`, which is where the count is read.
                 */
                requiresAuth: true,
            },
        ],
    },
    {
        label: 'menu_section_my_content',
        inset: false,
        rows: [
            {
                key: 'menu_my_membership',
                authOnly: true,
                icon: { name: 'users-simple-alt', weight: 'filled' },
                tile: TILE.indigo,
                href: MY_MEMBERSHIP_PATH,
                /*
                 * Gated on the *action*, like My Wallet and My Star above, and legacy agrees — its
                 * `btnMyMembership` is wrapped in `RequireAuth`. `/my-membership` does render for a
                 * guest (it shows a sign-in prompt), but the only thing a guest could do there is
                 * press a button that raises this same dialog one screen later.
                 */
                requiresAuth: true,
            },
            {
                key: 'menu_bookmarks',
                authOnly: true,
                icon: { name: 'bookmark-simple' },
                tile: TILE.warning,
                href: BOOKMARKS_PATH,
            },
        ],
    },
    {
        /**
         * **DISCOVER — one row, and legacy has it that way too.**
         *
         * A section of its own rather than folded into SERVICES (where this row briefly lived):
         * legacy's drawer declares a `discover` group between `my_content` and
         * `rewards_and_bonuses` whose only member is Mini App Center, and the grouping is the
         * point — finding somebody else's app is not a service Tevi performs for you, and the
         * section is where the next "browse what's out there" row goes.
         */
        label: 'menu_section_discover',
        inset: false,
        rows: [
            {
                /**
                 * Tevi's directory of mini apps. An **action**, not an `href`: the Center is itself
                 * a mini app, so pressing this opens the player over whatever the reader was on
                 * rather than navigating them away from it — the same reason the feature is a
                 * window and not a route (`features/mini-app`). `menu-drawer.tsx` closes the drawer
                 * and calls `useMiniApp().openCenter`.
                 *
                 * `grid-category` on a tile, not the raster app mark this row is drawn with:
                 * `docs/STATIC_ASSETS.md` forbids CDN art and the DS ships no real mark for it
                 * (see the note at the top of this file).
                 */
                icon: { name: 'grid-category', weight: 'filled' },
                key: 'menu_mini_app_center',
                authOnly: true,
                tile: TILE.primary,
                action: 'mini-app-center',
                /*
                 * The player gates the press itself (`useMiniApp().open` composes
                 * `useRequireAuth`), so this is belt to those braces — and it puts the sign-in
                 * dialog up from the drawer rather than after it closes.
                 */
                requiresAuth: true,
            },
        ],
    },
    {
        label: 'menu_section_rewards',
        inset: false,
        rows: [
            {
                key: 'menu_redeem_giftcode',
                authOnly: true,
                icon: { name: 'ticket-perforated', weight: 'filled' },
                tile: TILE.success,
                href: GIFT_CODE_PATH,
                /*
                 * **Not** `requiresAuth`, unlike the Identification row, and legacy agrees: its
                 * `btnRedeemGiftCode` is a plain link while `btnIdentification` opens the login
                 * dialog. The difference is what a guest finds there — `/redeem-gift-code`
                 * explains what a gift code is and what it is worth, and its one action gates
                 * itself (the button reads "Sign in"), so pressing it must not raise a dialog.
                 *
                 * `authOnly` all the same, because that is a different question and legacy answers
                 * it the other way (`allowed: isAuthenticated`): the explanation stays reachable at
                 * its own URL, it is just not listed to somebody with no Star account to redeem
                 * into. This section has one row, so a guest loses the heading with it.
                 */
            },
        ],
    },
    /**
     * SERVICES — the section legacy puts between Rewards and Account settings, and the one this table
     * did not have until `/star-transfer` existed. Its rows are **grant-gated**, so for an ordinary
     * creator the section renders nothing at all and `menu-drawer` drops the heading with it.
     *
     * Payout (`can('payout-agency')`) is legacy's second row here and is not included: `/payout` is
     * still an un-migrated screen, and a row pointing at a 404 is worse than no row (see `ActionRows`).
     * It is one entry when that screen lands.
     */
    {
        label: 'menu_section_services',
        inset: false,
        rows: [
            {
                key: 'menu_star_transfer',
                authOnly: true,
                /*
                 * A **star**, not an arrow: legacy's own glyph here is a solid star with three little bars
                 * over it (`btnStarTransfer`'s inline SVG). It was `arrow-up-right`, which described the
                 * direction and lost the subject.
                 *
                 * `star-star` — a star carrying a second, smaller one — over the plain `star` this briefly
                 * used, because the drawer already spends `star` twice (Get more Star, My Star) and three
                 * rows differing only by tile colour is a list you have to read rather than scan. It is
                 * also the closest thing the sprite has to legacy's star-plus-marks. `star-magic` was the
                 * third candidate and lost: no filled weight, so it would be the one outline glyph in a
                 * column of solid ones. All three were rendered at 20px on this tile before choosing.
                 */
                icon: { name: 'star-star', weight: 'filled' },
                tile: TILE.indigo,
                href: STAR_TRANSFER_PATH,
                capability: 'star-transfer',
                /*
                 * Gated on the action as well as on the grant, like My Wallet and Identification. The
                 * grant check already hides the row for a guest (no session, no grants), so this is
                 * belt to that braces — and it costs nothing.
                 */
                requiresAuth: true,
            },
        ],
    },
    {
        label: 'menu_section_account_settings',
        inset: false,
        rows: [
            {
                key: 'menu_identification',
                authOnly: true,
                icon: { name: 'address-card', weight: 'filled' },
                tile: TILE.zinc,
                // Overwritten with the account's real verification state — see the
                // Identification case in `menu-drawer`'s `rowTrailing`. The key here is
                // what an account that has submitted nothing shows, which is also what a
                // guest sees.
                value: 'menu_value_none',
                href: IDENTIFICATION_PATH,
                // Legacy gates the row itself (`btnIdentification` opens the login dialog),
                // and so does this — even though `/identification` is readable signed out,
                // since the only thing on it a guest could do is press a button that would
                // raise the same dialog one screen later.
                requiresAuth: true,
            },
            {
                key: 'menu_privacy_security',
                authOnly: true,
                icon: { name: 'shield', weight: 'filled' },
                tile: TILE.warning,
                view: 'privacy-security',
                requiresAuth: true,
            },
            {
                key: 'menu_data_storage',
                icon: { name: 'database', weight: 'filled' },
                tile: TILE.success,
                view: 'data-storage',
            },
            // TODO: tạm ẩn — bật lại khi có màn hình cài đặt thông báo
            // { key: 'menu_notification', icon: { name: 'bell' }, tile: TILE.warning },
            {
                key: 'menu_appearance',
                icon: { name: 'contrast', weight: 'filled' },
                tile: TILE.indigo,
                value: '',
                view: 'appearance',
            },
            {
                key: 'menu_language',
                icon: { name: 'globe', weight: 'filled' },
                tile: TILE.indigo,
                value: '',
                view: 'language',
            },
            {
                key: 'menu_other_settings',
                icon: { name: 'gear' },
                tile: TILE.zinc,
                view: 'other-settings',
            },
        ],
    },
    {
        label: 'menu_section_help',
        inset: false,
        rows: [
            {
                key: 'menu_ask_a_question',
                authOnly: true,
                icon: { name: 'comments-text', weight: 'filled' },
                tile: TILE.indigo,
            },
            { key: 'menu_faq', icon: { name: 'question-circle' }, tile: TILE.zinc },
            {
                key: 'menu_send_feedback',
                icon: { name: 'message-exclamation', weight: 'filled' },
                tile: TILE.indigo,
            },
            {
                key: 'menu_report_issue',
                icon: { name: 'flag-swallowtail', weight: 'filled' },
                tile: TILE.warning,
            },
        ],
    },
    {
        label: 'menu_section_login',
        inset: false,
        rows: [
            {
                key: 'menu_switch_account',
                authOnly: true,
                icon: { name: 'user-swich', weight: 'filled' },
                tile: TILE.indigo,
                action: 'switch-account',
            },
            {
                key: 'menu_logout',
                authOnly: true,
                icon: { name: 'logout-bracket' },
                tile: TILE.error,
                action: 'sign-out',
            },
        ],
    },
]

/**
 * Other settings — the eight rows the legacy app pushes from that entry, in its order,
 * with its destinations (`../tevi-web-app`:
 * `layouts/common/iconBtnMenu/menu/content/btnOtherSettings`). Every tile is Zinc 500
 * there, so they are here too.
 *
 * **The icons are not the legacy ones.** Legacy draws each as a bespoke 28×28 SVG with
 * the grey tile baked into the path — not sprite glyphs — and this app takes its icons
 * from the DS sprite only. Six are honest matches; three have no sprite equivalent and
 * carry the nearest semantic glyph instead, marked below. Worth a design pass.
 *
 * The legal documents, the safety policy, the community guidelines, the moderation policy
 * and the brand assets are wired. `/support` does not exist yet, and stays unwired rather
 * than pointing at a 404 — it is a one-line `href` when it lands.
 */
export const OTHER_SETTINGS_ROWS: Row[] = [
    // legacy art is a hand over a shield; the sprite has neither
    {
        key: 'menu_privacy_policy',
        icon: { name: 'lock-simple' },
        tile: TILE.zinc,
        href: '/privacy',
    },
    {
        key: 'menu_terms_of_use',
        icon: { name: 'info-circle', weight: 'filled' },
        tile: TILE.zinc,
        href: '/terms',
    },
    // legacy art is a headset; the sprite has none
    {
        key: 'menu_help_center',
        icon: { name: 'comment-text-question-circle' },
        tile: TILE.zinc,
        external: true,
    },
    {
        key: 'menu_brand_assets',
        icon: { name: 'star-magic' },
        tile: TILE.zinc,
        href: '/brand-assets',
    },
    // legacy art is a shield with a tick; the sprite's shield has no tick
    {
        key: 'menu_safety',
        icon: { name: 'shield', weight: 'filled' },
        tile: TILE.zinc,
        href: '/safety',
    },
    {
        key: 'menu_community_guidelines',
        icon: { name: 'users', weight: 'filled' },
        tile: TILE.zinc,
        href: '/community-guidelines',
    },
    {
        key: 'menu_moderation',
        icon: { name: 'memo-pen' },
        tile: TILE.zinc,
        href: '/moderation',
    },
    // no sprite equivalent for legacy's box-with-a-fold; a version tag reads closest
    {
        key: 'menu_about_version',
        icon: { name: 'tag' },
        tile: TILE.zinc,
        valueText: process.env.NEXT_PUBLIC_APP_VERSION ?? '—',
    },
]

/**
 * Appearance — the three theme choices, in the mobile app's order (dark first, since that
 * is the default the app ships on). The values are next-themes' own, so they go straight
 * into `setTheme`; `system` is why `ThemeProvider` keeps `enableSystem` on while listing
 * only `['light', 'dark']` as themes.
 *
 * The mobile screen also carries an **APP ICON** section — Default / Black / Smoke / Wood.
 * That is iOS's alternate-app-icon API; the web has no equivalent (a PWA manifest icon is
 * fixed at install time), so the section is absent rather than faked.
 */
export const THEME_OPTIONS = [
    { value: 'dark', key: 'menu_theme_dark', icon: { name: 'moon', weight: 'filled' } },
    { value: 'light', key: 'menu_theme_light', icon: { name: 'sun', weight: 'filled' } },
    { value: 'system', key: 'menu_theme_system', icon: { name: 'contrast', weight: 'filled' } },
] as const satisfies readonly { value: string; key: string; icon: IconProps }[]
