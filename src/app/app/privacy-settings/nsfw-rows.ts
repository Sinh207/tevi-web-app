/**
 * The three `nsfw_settings` flags `/app/privacy-settings` owns, in legacy's order
 * (`../tevi-web-app/src/containers/app/privacySettings`).
 *
 * A table, not three copies of the same markup, for the reason `shared/components/action-rows.tsx`
 * gives: the write is identical in all three cases and only the field name and the words differ, so
 * a fourth flag should be one row here.
 *
 * ## Why it is a module and not a `const` in `screen.tsx`
 *
 * So it can be tested without rendering anything. The keys here are **computed** at the call site
 * (`t(row.titleKey)`), and `shared/i18n/keys.test.ts` says in as many words that computed keys are
 * invisible to it — it scans for literal `t('…')`. So the one failure this table has, a mistyped
 * key rendering `privacy_settings_blur_medai` on screen, is exactly the failure nothing else in the
 * suite can see. `nsfw-rows.test.ts` closes that, the way `brand-assets.test.ts` does for the brand
 * page's own `*Key` fields.
 *
 * It lives beside the screen rather than in `features/auth` because it is this screen's
 * presentation — which rows, in which order, with which words — and not something the auth feature
 * knows or needs. The *fields* are auth's (`accountNsfwSettings`); the list is the screen's.
 *
 * ## Two notes on the keys themselves
 *
 * `show_sensitive` reuses the **website's** strings (`privacy_security_*`, the account drawer's
 * row) rather than legacy's separate webview wording. It is one field on one account: two surfaces
 * describing it differently is two things to keep in step, and the drawer's sentence is the more
 * accurate of the two — it says the setting follows the account across devices, which is exactly
 * why a change made in this webview shows up on the website.
 *
 * ⚠ `blur_media` and `nsfw_search` are written here and read by the **app**. Nothing on the web
 * consumes them yet — `features/nsfw` gates on `show_sensitive` alone — so do not take their
 * presence here as evidence the web honours them. See B81 in `docs/BACKEND_QUESTIONS.md`.
 */
export interface NsfwRow {
    /** The key inside the `nsfw_settings` object. */
    field: 'show_sensitive' | 'blur_media' | 'nsfw_search'
    titleKey: string
    /** The sentence under the title — a subtitle, never a tooltip. See `screen.tsx`. */
    noteKey: string
}

export const NSFW_ROWS: readonly NsfwRow[] = [
    {
        field: 'show_sensitive',
        titleKey: 'privacy_security_allow_sensitive',
        noteKey: 'privacy_security_allow_sensitive_note',
    },
    {
        field: 'blur_media',
        titleKey: 'privacy_settings_blur_media',
        noteKey: 'privacy_settings_blur_media_note',
    },
    {
        field: 'nsfw_search',
        titleKey: 'privacy_settings_nsfw_search',
        noteKey: 'privacy_settings_nsfw_search_note',
    },
]
