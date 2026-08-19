/*
 * `@features/<x>/routes`, **not** the feature barrels. Each of those pulls in a screen view, which
 * reaches back into `features/channel` — a cycle between barrels that ESM resolves by handing one
 * side a half-initialised module. Both files are import-free for exactly this reason; see their
 * docs. Same rule, same shape, as `channel-owner-actions.tsx`'s import of `@features/earnings/routes`.
 *
 * The balance *figure* on the My Star row does not come from here — `menu-drawer.tsx` reads it from
 * `features/balance`'s provider, which is what keeps this file JSX-free and hook-free.
 */
import { MY_STAR_PATH } from '@features/my-star/routes'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
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
    icon?: IconProps
    tile?: string
    glyph?: string
    /**
     * Runs in place instead of going anywhere — the row keeps its chevron off, since
     * there is nothing to drill into.
     */
    action?: 'sign-out' | 'switch-account'
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
     * Gate the **action** rather than the route: pressing it while signed out raises the
     * sign-in dialog instead of pushing. Legacy does the same on this row
     * (`btnPrivacyAndSecurity` calls `openDialog('login')`), and it is the app's rule
     * everywhere — a dead session never redirects, so whatever is on screen stays.
     */
    requiresAuth?: boolean
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
 * Tevi Coin, Mini App Center and Tevi features are dropped: all three are authored
 * with a raster app mark, and the DS export ships **one placeholder PNG for all
 * three** rather than the real marks. Add them back when the real assets exist.
 * Tevi Premium stayed and took the sprite's `premium` glyph — Figma leaves its tile
 * empty and the comp fills it with a crown PNG we do not have either.
 */
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
                icon: { name: 'star', weight: 'filled' },
                tile: TILE.title,
                glyph: 'var(--accents-yellow)',
            },
            { key: 'menu_tevi_premium', mark: { name: 'premium', weight: 'filled' } },
            {
                key: 'menu_gift_premium',
                icon: { name: 'gift-simple', weight: 'filled' },
                tile: TILE.warning,
            },
        ],
    },
    {
        label: 'menu_section_assets',
        inset: true,
        rows: [
            {
                key: 'menu_my_wallet',
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
                icon: { name: 'address-card', weight: 'filled' },
                tile: TILE.success,
            },
        ],
    },
    {
        label: 'menu_section_creators',
        inset: true,
        rows: [
            {
                key: 'menu_dashboard_analytics',
                icon: { name: 'chart-column-alt', weight: 'filled' },
                tile: TILE.indigo,
            },
            {
                key: 'menu_monetization',
                icon: { name: 'dollar-sign', weight: 'filled' },
                tile: TILE.success,
            },
            {
                key: 'menu_space_tier',
                icon: { name: 'award', weight: 'filled' },
                tile: TILE.warning,
            },
            {
                key: 'menu_mcn_partnership',
                icon: { name: 'document-list', weight: 'filled' },
                tile: TILE.warning,
            },
            {
                key: 'menu_follow_requests',
                icon: { name: 'user-plus', weight: 'filled' },
                tile: TILE.indigo,
            },
        ],
    },
    {
        label: 'menu_section_my_content',
        inset: false,
        rows: [
            {
                key: 'menu_my_membership',
                icon: { name: 'users-simple-alt', weight: 'filled' },
                tile: TILE.indigo,
            },
            {
                key: 'menu_bookmarks',
                icon: { name: 'bookmark-simple' },
                tile: TILE.warning,
            },
        ],
    },
    {
        label: 'menu_section_rewards',
        inset: false,
        rows: [
            {
                key: 'menu_redeem_giftcode',
                icon: { name: 'ticket-perforated', weight: 'filled' },
                tile: TILE.success,
            },
        ],
    },
    {
        label: 'menu_section_account_settings',
        inset: false,
        rows: [
            {
                key: 'menu_identification',
                icon: { name: 'address-card', weight: 'filled' },
                tile: TILE.zinc,
                // Overwritten with the account's real verification state — see the
                // Identification case in `menu-drawer`'s `rowTrailing`. The key here is
                // what an account that has submitted nothing shows, which is also what a
                // guest sees.
                value: 'menu_value_none',
                href: '/identification',
                // Legacy gates the row itself (`btnIdentification` opens the login dialog),
                // and so does this — even though `/identification` is readable signed out,
                // since the only thing on it a guest could do is press a button that would
                // raise the same dialog one screen later.
                requiresAuth: true,
            },
            {
                key: 'menu_privacy_security',
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
                icon: { name: 'user-swich', weight: 'filled' },
                tile: TILE.indigo,
                action: 'switch-account',
            },
            {
                key: 'menu_logout',
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
