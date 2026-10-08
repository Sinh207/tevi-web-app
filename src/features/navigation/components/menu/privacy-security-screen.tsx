'use client'

import {
    accountAutoFollow,
    accountNsfwSettings,
    accountShowSensitive,
    accountTwoFaPasscode,
    PASSWORD_SETTINGS_PATH,
    TWO_FA_SETTINGS_PATH,
    useAuth,
    useUpdateMe,
    useUserLogin,
} from '@features/auth'
import {
    AUTO_FOLLOW_SECONDS,
    BLOCKED_ACCOUNTS_PATH,
    type ChannelPrivacy,
    SPACE_VISIBILITY_PATH,
    useMyChannel,
} from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { FieldLabel } from '@shared/ui/field-label'
import type { IconProps } from '@shared/ui/icon'
import { LeftBarList, LeftBarRow, LeftBarSection } from '@shared/ui/left-bar'
import { Toggle } from '@shared/ui/toggle'
import { usePathname } from 'next/navigation'
import { useId } from 'react'
import { useDrawerNavigate } from '../../hooks/use-drawer-navigate'
import { isPathActive, MENU_ROW_ACTIVE_CLASS } from '../../lib/menu-active'
import { TILE } from '../../lib/menu-tiles'

/**
 * Privacy and Security — the legacy drawer's second level, rebuilt.
 *
 * Legacy: `../tevi-web-app/src/components/layouts/common/iconBtnMenu/menu/content/
 * btnPrivacyAndSecurity`. Its five rows in the same two groups, and the same split between
 * them: the link rows *go* somewhere, the last two *are* the setting.
 *
 * **Six rows now, not five.** Two-step verification joins the first group — see the row itself
 * for why it is not in legacy's list and why it belongs beside the password.
 *
 * ── what is deliberately different ────────────────────────────────────────────────────
 *
 * **The explanations are subtitles, not tooltips.** Legacy wraps each switch in a MUI
 * `Tooltip`, so on a phone — where this drawer is most of its traffic — the sentence
 * explaining what the switch does is unreachable, and to a screen reader it is a title
 * attribute on a control it has already announced. The DS list row has a subtitle part
 * (`.tevi-list-row__subtitle`); it says the same thing to everyone, and the switch points
 * `aria-describedby` at it.
 *
 * **The switches move before the server answers.** See `useUpdateMe` — legacy awaits the
 * round trip with the control disabled, so a flick of the switch is followed by a pause
 * and then agreement.
 *
 * **Icons are DS sprite glyphs, not legacy's bespoke SVGs.** Legacy draws each row's mark
 * as a hand-authored 28×28 with the tile colour baked into the path. Each row now draws
 * the DS glyph of legacy's object (key, struck-through person, person, bolt, warning
 * diamond) — the first two waited on the 2026-10-08 library import.
 *
 * ── where the three link rows go ──────────────────────────────────────────────────────
 * All four destinations now exist — `/settings/password`, `/settings/two-step-verification`,
 * `/settings/space-visibility` and `/settings/blocked-accounts` — so every row here navigates.
 * The two owned by
 * `features/channel` are linked through that feature's exported path constants rather than
 * a literal, because a literal keeps type-checking and keeps rendering after the page moves;
 * it just 404s, which is the failure mode that reaches production.
 */

/** Legacy's mask for "a password is set" — six bullets, not the real length. */
const PASSWORD_MASK = '••••••'

/**
 * The three `ChannelPrivacy` values.
 *
 * Legacy stores these strings lowercase and capitalises them in CSS
 * (`textTransform: 'capitalize'` on the value span), which is a rule about English
 * pretending to be a rule about text — it does nothing for CJK, mangles nothing only by
 * luck in Vietnamese, and takes the decision away from whoever writes the translation.
 * The casing lives in the string here instead.
 */
const PRIVACY_LABEL_KEY: Record<ChannelPrivacy, string> = {
    public: 'privacy_security_visibility_public',
    protected: 'privacy_security_visibility_protected',
    unpublished: 'privacy_security_visibility_unpublished',
}

type LinkRow = {
    key: string
    icon: IconProps
    tile: string
    /** The right-hand value, when the row has one to report. */
    value?: string
    /** Set once the destination exists — see the note at the top of the file. */
    href?: string
}

export function PrivacySecurityScreen({ active }: { active: boolean }) {
    const { t } = useTranslation()
    const { currentUser, isAuthenticated } = useAuth()
    const { update, isPending } = useUpdateMe()
    const pathname = usePathname()
    /*
     * Whether this account can sign in with a password, which is **not** what
     * `currentUser.email` says: an account created with Google carries a Google address on
     * its profile and has no password at all. This row used to read the profile and so told
     * every social-only account that it had one (`••••••`) — it is the one thing the row is
     * for. `GET v1/user-login/` is the question actually being asked, and it is the same
     * cache entry `/settings/password` reads, so the two cannot disagree.
     *
     * Gated on `active`, and this is the one thing on the screen that costs a request. The
     * drawer parks all of its screens mounted, so an ungated fetch here goes out at bootstrap
     * on every page for every signed-in visitor — to answer a question only asked by someone
     * who has walked two levels into the menu.
     */
    const { userLogin, hasCredentials } = useUserLogin({ enabled: active })
    /*
     * Free to read: `MyChannelProvider` holds the account's own channel for the whole app, so this is
     * a context read rather than a request, and so it needs no gate of its own.
     */
    const { myChannel } = useMyChannel()

    const autoFollowId = useId()
    const sensitiveId = useId()

    const autoFollow = accountAutoFollow(currentUser)
    const showSensitive = accountShowSensitive(currentUser)

    /*
     * `undefined` while the channel is unknown *and* for an account that has none — the
     * row then simply reports nothing, which is what legacy does (it renders the value
     * only `if (privacy)`). A placeholder would be inventing a visibility.
     */
    const privacy = myChannel?.privacy
    const privacyLabel = privacy ? t(PRIVACY_LABEL_KEY[privacy]) : undefined

    const linkRows: LinkRow[] = [
        {
            key: 'privacy_security_password',
            // Legacy's art is a key — the library's `key` (Figma names it `key-message`; see
            // `RENAME` in scripts/import-figma-icons.mjs).
            icon: { name: 'key', weight: 'filled' },
            tile: TILE.success,
            /*
             * "Add" rather than a mask when the account has no password — legacy reads
             * `userLogin?.email` for the same test, and so does this.
             *
             * `undefined` while the answer is unknown, which is the same choice the Space
             * visibility row below makes: a mask shown before the fetch lands is a claim
             * that the account has a password, and it would be wrong for exactly the
             * accounts this row matters to.
             *
             * The test is "is there an answer", not "is a fetch in flight". A disabled query
             * is not loading and has no data, so keying off the loading flag would render
             * "Add" for the frame between this screen becoming active and its request
             * starting — the wrong half of the claim, shown exactly as the panel slides in.
             * It also covers the error case, where there is no answer and never will be.
             */
            value:
                userLogin === undefined
                    ? undefined
                    : hasCredentials
                      ? PASSWORD_MASK
                      : t('privacy_security_password_add'),
            href: PASSWORD_SETTINGS_PATH,
        },
        {
            /*
             * **Not a legacy row.** Legacy's Privacy and Security screen has five entries and this is
             * not one of them — its web app never built the two-step-verification screen at all, so
             * there was nowhere for a row to lead. There is now, and this is where it belongs: the
             * one setting on the account that gates a *money* action sits beside the password, above
             * the two rows that gate what other people can see.
             */
            key: 'privacy_security_two_step',
            /*
             * `shield`, and it is a compromise the sprite forces. Everything that would say this
             * exactly — a shield with a tick, a key, a fingerprint — is absent from the DS subset;
             * `badge-check` came closest and **has no filled drawing**, so it would be the one
             * outline glyph in a column of solid ones (the reason `star-magic` lost the Star transfer
             * row). `shield` does repeat the glyph on the drawer row that leads *here*, which is on
             * the screen behind this one and never on it at the same time — and the tile colour is
             * different, so the two do not read as the same entry. Worth a design pass.
             */
            icon: { name: 'shield', weight: 'filled' },
            tile: TILE.primary,
            /*
             * On or off, from `/me` — free, already in the cache, and the same flag the withdrawal
             * gate reads. No `undefined` branch as the Password row has: that row waits on a fetch
             * that can fail, this one reads a profile the drawer cannot render without.
             */
            value: isAuthenticated
                ? t(
                      accountTwoFaPasscode(currentUser)
                          ? 'privacy_security_two_step_on'
                          : 'privacy_security_two_step_off',
                  )
                : undefined,
            href: TWO_FA_SETTINGS_PATH,
        },
        {
            key: 'privacy_security_space_visibility',
            icon: { name: 'user-simple-alt', weight: 'filled' },
            tile: TILE.indigo,
            value: privacyLabel,
            href: SPACE_VISIBILITY_PATH,
        },
        {
            key: 'privacy_security_blocked_accounts',
            // Legacy's art is a person struck through: `user-slash`.
            icon: { name: 'user-slash', weight: 'filled' },
            tile: TILE.zinc,
            /*
             * No `value`. The row could report a count, and legacy does not — deliberately
             * kept that way: the number would cost a `my-channel/blocks/` request from the
             * drawer, on every open, for a row whose whole job is to be a door. The page
             * behind it says how many there are, in the one place where the answer is also
             * the content.
             */
            href: BLOCKED_ACCOUNTS_PATH,
        },
    ]

    /*
     * Two kinds of unavailable, and they must not be the same attribute — see `Toggle`.
     *
     * `aria-disabled` while a write is in flight: *every* control, because the endpoint
     * answers with the whole profile and two overlapping writes overwrite each other's
     * field (`useUpdateMe`). It has to be the soft form, because the switch you just
     * pressed is the focused element — `disabled` would blur it and drop the keyboard to
     * the top of the document on every single toggle.
     *
     * `disabled` when the session is not a real one. This screen is only reachable signed
     * in, but the drawer keeps it mounted: a session dying while it sits parked would
     * otherwise leave two live switches behind a dead bearer. Nothing is mid-interaction
     * in that case, so taking the control out of the tab order is the honest answer.
     */
    const pending = isPending || undefined

    /*
     * The **gated** variant, from the hook the drawer's root list shares
     * (`hooks/use-drawer-navigate.ts`) — this was a local copy of it until the two diverged
     * by one modifier key would have been a silent regression. All three destinations here
     * are meaningless without a real account, and this screen is reachable with a session
     * that has since died, so the plain click raises the sign-in dialog rather than landing
     * someone signed out on a form they cannot use. A modified click still opens the URL,
     * and each of those pages handles a guest on its own.
     */
    const { navigateGated } = useDrawerNavigate()

    return (
        <>
            <LeftBarSection>
                <LeftBarList bordered>
                    {linkRows.map((row, i) => (
                        <LeftBarRow
                            data-testid="navigation-menu-privacy-row"
                            data-row-key={row.key}
                            key={row.key}
                            rule={i > 0}
                            title={t(row.key)}
                            icon={row.icon}
                            tile={row.tile}
                            // The mark had the attribute and no paint: these rows carried
                            // `aria-current` from the start but never the class that shows it,
                            // so all three of this screen's destinations announced "current
                            // page" to a screen reader and looked identical to everyone else.
                            className={MENU_ROW_ACTIVE_CLASS}
                            {...(row.href
                                ? {
                                      as: 'a' as const,
                                      href: row.href,
                                      onClick: navigateGated(row.href),
                                      'aria-current': isPathActive(pathname, row.href)
                                          ? ('page' as const)
                                          : undefined,
                                  }
                                : {})}
                            trailing={
                                row.value === undefined ? undefined : (
                                    <span className="type-dense-default text-(--text-body)">
                                        {row.value}
                                    </span>
                                )
                            }
                        />
                    ))}
                </LeftBarList>
            </LeftBarSection>

            <LeftBarSection>
                <FieldLabel className="h-[32px]">
                    {t('privacy_security_section_preferences')}
                </FieldLabel>
                <LeftBarList bordered>
                    <LeftBarRow
                        title={t('privacy_security_auto_follow')}
                        subtitle={t('privacy_security_auto_follow_note', {
                            seconds: AUTO_FOLLOW_SECONDS,
                        })}
                        subtitleId={autoFollowId}
                        icon={{ name: 'bolt-lightning', weight: 'filled' }}
                        tile={TILE.warning}
                        control={
                            <Toggle
                                data-testid="navigation-menu-auto-follow"
                                checked={autoFollow}
                                disabled={!isAuthenticated}
                                aria-disabled={pending}
                                // The row's title is the switch's name and its subtitle the
                                // description — the row is a `div`, so nothing else is
                                // announcing them.
                                aria-label={t('privacy_security_auto_follow')}
                                aria-describedby={autoFollowId}
                                onCheckedChange={next => update({ auto_follow: next })}
                            />
                        }
                    />
                    <LeftBarRow
                        rule
                        title={t('privacy_security_allow_sensitive')}
                        subtitle={t('privacy_security_allow_sensitive_note')}
                        subtitleId={sensitiveId}
                        // Legacy's art is a "18" in a diamond; the sprite has the diamond
                        // with an exclamation and no numerals.
                        icon={{ name: 'exclamation-diamond', weight: 'filled' }}
                        tile={TILE.error}
                        control={
                            <Toggle
                                data-testid="navigation-menu-allow-sensitive"
                                checked={showSensitive}
                                disabled={!isAuthenticated}
                                aria-disabled={pending}
                                aria-label={t('privacy_security_allow_sensitive')}
                                aria-describedby={sensitiveId}
                                onCheckedChange={next =>
                                    update({
                                        // Sent whole: the endpoint replaces the object, so
                                        // its other keys have to come back with it.
                                        nsfw_settings: {
                                            ...accountNsfwSettings(currentUser),
                                            show_sensitive: next,
                                        },
                                    })
                                }
                            />
                        }
                    />
                </LeftBarList>
            </LeftBarSection>
        </>
    )
}
