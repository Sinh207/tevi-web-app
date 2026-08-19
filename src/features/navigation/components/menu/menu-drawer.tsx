'use client'

import { useAccountSwitcher, useAuth, useRequireAuth } from '@features/auth'
import { useBalanceDisplay } from '@features/balance'
import { type IdentityState, useIdentityStatus } from '@features/identification'
import { toLocale } from '@shared/i18n/settings'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Avatar, avatarImageClass } from '@shared/ui/avatar'
import { Card, CardTrailing } from '@shared/ui/card'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { FieldLabel } from '@shared/ui/field-label'
import { Icon } from '@shared/ui/icon'
import {
    LeftBar,
    LeftBarBalanceAction,
    LeftBarBalanceActions,
    LeftBarBalanceItem,
    LeftBarBalanceRule,
    LeftBarBalanceStats,
    LeftBarList,
    LeftBarProfileContent,
    LeftBarProfileHandle,
    LeftBarProfileMeta,
    LeftBarRow,
    LeftBarSection,
    leftBarProfileCopyClass,
} from '@shared/ui/left-bar'
import { ListSeparator } from '@shared/ui/list'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { useAvatarUrl } from '../../hooks/use-avatar-url'
import { useDrawerNavigate } from '../../hooks/use-drawer-navigate'
import { isPathActive, isViewActive, MENU_ROW_ACTIVE_CLASS } from '../../lib/menu-active'
import { MENU_SECTIONS, OTHER_SETTINGS_ROWS, type Row, THEME_OPTIONS } from '../../lib/menu-rows'
import { type DrawerView, useMenu } from '../../providers/menu-state'
import { DataStorageScreen } from './data-storage-screen'
import { DrawerScreen, DrawerSubScreen, PickerList, type PickerOption } from './drawer-screen'
import { PrivacySecurityScreen } from './privacy-security-screen'

/**
 * The account drawer's content — the DS `Left Bar` (Figma 3626:26373), adapted the way
 * the `My Star — Desktop` comp adapts it for web
 * (claude.ai/design/p/87e00715-ad01-43ad-9a23-20469b60276d):
 *
 *   · a `Personal` heading, since on web the drawer is a panel rather than a screen
 *   · the profile row is `Card type="basic"`, not the DS's `premium` gradient
 *   · the balance card takes a visible border
 *   · every row ends in a drilldown chevron
 *   · 24 of top padding instead of the DS's 64 — that 64 is a mobile status-bar inset
 *
 * This file is the composition only. What the rows *are* lives in `lib/menu-rows.ts`, the
 * screen-stack layers and the pick-one list in `drawer-screen.tsx`, and which screen is
 * showing in `providers/menu-state.tsx` — `AppSide` sizes the drawer's frame from that
 * last one (a pushed screen is full-bleed on mobile).
 */
/**
 * The Identification row's trailing value, per verification state. A `Record`, so adding a
 * state to `IdentityState` is a type error here rather than a row that silently says "None"
 * about someone who is verified.
 */
const IDENTITY_VALUE_KEY: Record<IdentityState, string> = {
    unverified: 'menu_value_none',
    pending: 'menu_value_pending',
    verified: 'menu_value_verified',
}

export function MenuDrawer() {
    const { t, currentLanguage, LANGUAGES, changeLanguage } = useTranslation()
    const { signOut, isSigningOut, isAuthenticated } = useAuth()
    const [confirmingSignOut, setConfirmingSignOut] = useState(false)
    const requireAuth = useRequireAuth()
    const openAccountSwitcher = useAccountSwitcher()
    const avatar = useAvatarUrl()
    const { close, open, view, push, pop } = useMenu()
    /*
     * Not fetched for a guest or an anonymous session (see `useIdentityStatus`), so the
     * drawer costs a signed-out visitor no request — and gated on `open`, so it costs a
     * signed-in one nothing either until they actually open the menu. This drawer is mounted
     * in the shell on every page; ungated, the row's value was a request at bootstrap for
     * everyone, to fill in a line most sessions never look at.
     *
     * Closing does not throw the answer away — a disabled query keeps its cache, and the
     * five-minute `staleTime` means reopening is free. A verification finished in the
     * meantime still lands: `identification-view.tsx` invalidates the key, and an invalidated
     * query refetches when it is enabled again.
     */
    const { state: identityState, isKnown: identityKnown } = useIdentityStatus({ enabled: open })
    /*
     * The two figures on the balance card, and the Star row's trailing value.
     *
     * Ungated, unlike `useIdentityStatus` above — and the difference is deliberate. That query
     * exists only to fill one line in a drawer most sessions never open, so it waits for `open`.
     * This one is read by the **mobile top bar** as well, which is on screen without any
     * interaction, so gating it here would buy nothing and would leave the two consumers
     * disagreeing about whether the balance had loaded. Both subscribe to the same query key, so
     * TanStack serves them one request either way.
     *
     * Already formatted, and `—` rather than `0` while unknown: that decision belongs to the
     * feature that owns the unit, not to this file. See `useBalanceDisplay`.
     */
    const { star: starBalance, usd: usdBalance } = useBalanceDisplay()
    // `i18n.language` is whatever was negotiated, which is not always one of the eight
    // codes the switcher lists — a region tag, or a locale we ship but don't surface.
    // Clamping it is what makes both the row's value and the check land on a real row.
    const activeLocale = toLocale(currentLanguage)
    const language = LANGUAGES.find(l => l.code === activeLocale)?.name ?? activeLocale

    /**
     * The chosen theme — `system` included, which is why this is `theme` and not
     * `resolvedTheme`: the picker has to be able to show "System" as the selection, not the
     * light-or-dark it currently resolves to.
     *
     * It comes out of localStorage, so it does not exist during SSR or on the first client
     * render. Reading it before `mounted` would mean rendering one row as checked on the
     * server and a different one on the client — a hydration mismatch on every visit where
     * the stored choice is not the default. Until then the picker shows no selection, which
     * is a drawer screen nobody is looking at yet.
     */
    const { theme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const activeTheme = mounted ? theme : undefined
    const themeLabel = THEME_OPTIONS.find(o => o.value === activeTheme)?.key

    const themeOptions: PickerOption[] = THEME_OPTIONS.map(option => ({
        value: option.value,
        label: t(option.key),
        mark: <Icon {...option.icon} size={24} className="text-(--icon-secondary)" />,
    }))

    const languageOptions: PickerOption[] = LANGUAGES.map(option => ({
        value: option.code,
        label: option.name,
        // Decorative: the row's own title already says which language this is, in that
        // language's words. Announcing the flag on top of it would read the country out.
        mark: (
            <span aria-hidden="true" className="type-title-t1-semibold">
                {option.flag}
            </span>
        ),
    }))

    const router = useRouter()
    const pathname = usePathname()

    /**
     * Both handlers live in `hooks/use-drawer-navigate.ts` — the Privacy-and-security
     * sub-screen needs the same pair for its own rows, and a second copy of the modifier
     * list and the close-then-push order is two things to keep in step. The reasoning
     * behind each is documented there.
     */
    const { navigate, navigateGated } = useDrawerNavigate()

    /**
     * Push a sub-screen that needs a real session, or raise the sign-in dialog.
     *
     * Gated on the *action*, not on the route — pressing it while signed out raises the
     * sign-in dialog instead of navigating away, which is the whole reason a dead session
     * never redirects: whatever the visitor was reading stays where it is.
     *
     * The drawer closes only on the *guest* path, and only because the dialog portals to
     * the top of the document: leaving the panel standing behind it stacks two overlays
     * (the same reason `handleSwitchAccount` closes). Signed in, the drawer stays open and
     * pushes — the screen is inside it.
     */
    const pushGated = (view: DrawerView) => () => {
        if (!isAuthenticated) close()
        requireAuth(() => push(view))()
    }

    /**
     * Switching account is the first thing in this app that a guest cannot simply do, so it
     * is gated the same way. Signed in, it raises the switcher
     * (`features/auth/components/account-switcher-dialog`), which is mounted at the provider
     * root rather than here — the drawer is only one of the controls that will open it.
     */
    const handleSwitchAccount = () => {
        // Closed first, and in both branches: both dialogs portal to the top of the
        // document, so leaving the drawer standing behind one just stacks two overlays
        // on one another.
        close()
        requireAuth(openAccountSwitcher)()
    }

    /**
     * Picking a language applies it and closes, as legacy does — the switch repaints the
     * whole shell, so leaving the drawer standing on the list you just used would show
     * you a screen mid-swap instead of the app in the language you asked for. Closing
     * also pops the view back to root, so the drawer reopens where the next visit expects it.
     *
     * Picking the language that is already active still closes: it is what a picker does,
     * and `changeLanguage` is a no-op cost either way.
     *
     * Not awaited, deliberately. `changeLanguage` is async now — the client carries English plus
     * the locale the page was served in, so a third one is a chunk fetch away (7–25 KB, see
     * `i18n/locale-bundles.ts`). Closing first is still right: the drawer standing open on the list
     * while a request settles is the mid-swap screen this avoids, and the shell repaints itself the
     * moment the bundle lands.
     */
    const selectLanguage = (code: string) => {
        void changeLanguage(code)
        close()
    }

    /**
     * Signing out asks first, as legacy does
     * (`components/layouts/common/iconBtnMenu/menu/content/btnLogout`). It is one press
     * away from every screen and it ends a session that may have taken a social popup and
     * a Turnstile to establish — cheap to confirm, annoying to undo.
     *
     * `signOut` does not end at "no session" — it re-establishes an anonymous one, so the
     * drawer is still standing on something when it returns and the shell has no signed-out
     * state to fall into. Failure is swallowed on purpose: `signOut` already tolerates a
     * failed `/logout` (the local tokens go either way), so the only thing left that can
     * throw is minting the replacement anonymous session — and a toast saying so would be
     * about our plumbing, not about the thing they asked for, which did happen.
     */
    const confirmSignOut = async () => {
        try {
            await signOut()
            setConfirmingSignOut(false)
            close()
            router.push('/')
        } catch {
            // `signOut` tolerates a failed /logout on its own; nothing left to do.
        }
    }

    /**
     * What makes a row do something: a link to a page, a push to a sub-screen, an action
     * that runs in place, or nothing at all while its destination does not exist.
     *
     * `aria-current` marks the row for where you are — legacy did the same with
     * `router.pathname`, for the linking rows only. Two values, because two different
     * claims: `page` is the row *of* the current page, `location` the row of the screen
     * that **contains** it. Both take the same paint (`MENU_ROW_ACTIVE_CLASS`); only the
     * announcement differs, and calling a pushing row `page` would be a lie to a screen
     * reader — it is a door, not the page behind it. See `lib/menu-active.ts` for why the
     * second one is not optional: without it the drawer shows no active state at all on
     * nine of its ten destinations.
     */
    const rowAction = (row: Row) => {
        if (row.href) {
            return {
                as: 'a',
                href: row.href,
                onClick: row.requiresAuth ? navigateGated(row.href) : navigate(row.href),
                'aria-current': isPathActive(pathname, row.href) ? 'page' : undefined,
            } as const
        }
        if (row.action === 'sign-out') {
            return {
                onClick: () => setConfirmingSignOut(true),
                'aria-disabled': isSigningOut || undefined,
            } as const
        }
        if (row.action === 'switch-account') {
            return { onClick: handleSwitchAccount } as const
        }
        if (row.view) {
            const view = row.view
            return {
                onClick: row.requiresAuth ? pushGated(view) : () => push(view),
                'aria-current': isViewActive(pathname, view) ? 'location' : undefined,
            } as const
        }
        return { onClick: undefined } as const
    }

    /**
     * Trailing content per row: an explicit value, a translated one, the current
     * language, or — for a row that leaves the app — the open-in-new glyph in place of
     * the chevron the other rows get.
     */
    const rowTrailing = (row: Row) => {
        if (row.valueText !== undefined) {
            return <span className="type-dense-default text-(--text-body)">{row.valueText}</span>
        }
        if (row.value !== undefined) {
            // Four rows carry live state rather than a fixed key. Appearance can be blank
            // for one render — see `activeTheme` — and blank is the honest answer there: a
            // placeholder would just be a value that changes under you on hydration.
            let value = t(row.value)
            if (row.key === 'menu_language') value = language
            if (row.key === 'menu_appearance') value = themeLabel ? t(themeLabel) : ''
            // The Star figure, per the design's dev note for this row. `—` while unknown and a
            // real `0` for a real zero — the same distinction the Identification row makes below,
            // and it matters more here: `0` is a claim about somebody's money, and "we have not
            // asked yet" is not that claim.
            if (row.key === 'menu_my_star') value = starBalance
            // Identification reads the same query its page does, so the row and the screen
            // it opens can never disagree — and finishing a verification updates both.
            //
            // Blank until the answer exists, for the reason Appearance is blank above it, and
            // with more at stake: `state` folds "not known yet" into `unverified`, so printing
            // it unconditionally tells a verified account it has submitted nothing — for the
            // length of the fetch, on the first row of the first screen of the drawer.
            if (row.key === 'menu_identification') {
                value = identityKnown ? t(IDENTITY_VALUE_KEY[identityState]) : ''
            }
            return (
                <span
                    className={cn(
                        'type-dense-default text-(--text-body)',
                        // Legacy paints this one value green, and only this one: it is the
                        // single row whose value is an achievement rather than a setting.
                        row.key === 'menu_identification' &&
                            identityState === 'verified' &&
                            'text-(--accents-success-active)',
                    )}
                >
                    {value}
                </span>
            )
        }
        return undefined
    }

    /*
     * The screen stack. All the screens are mounted at once and `view` decides which one is
     * on screen; the others sit parked at the edges. Root first in source order, so a
     * pushed screen paints over it without anything here needing a z-index.
     */
    return (
        <>
            <div data-slot="menu-stack" className="relative h-full">
                <DrawerScreen depth="root" active={view === 'root'}>
                    <LeftBar
                        as="aside"
                        aria-label={t('menu_title')}
                        className="w-full min-h-full bg-(--background-surface) pt-6"
                    >
                        <h1 className="type-title-t1-bold mb-2 text-(--text-title)">
                            {t('menu_personal')}
                        </h1>
                        <Card type="basic" className="cursor-pointer items-center">
                            <Avatar size="large" type={avatar ? 'image' : 'placeholder'}>
                                {avatar ? (
                                    <Image
                                        alt=""
                                        src={avatar}
                                        width={48}
                                        height={48}
                                        className={avatarImageClass}
                                    />
                                ) : (
                                    <Icon name="user-simple-alt" size={24} />
                                )}
                            </Avatar>
                            <LeftBarProfileContent>
                                <LeftBarProfileHandle
                                    name={t('menu_profile_name')}
                                    at={t('menu_profile_at')}
                                />
                                <LeftBarProfileMeta>
                                    <span>{t('menu_profile_id', { id: '—' })}</span>
                                    <Icon
                                        name="pages"
                                        weight="filled"
                                        size={16}
                                        className={leftBarProfileCopyClass}
                                        title={t('menu_copy_id')}
                                    />
                                </LeftBarProfileMeta>
                            </LeftBarProfileContent>
                            <CardTrailing type="option">
                                <Icon name="angle-right" size={20} className="rtl:-scale-x-100" />
                            </CardTrailing>
                        </Card>

                        <Card
                            type="balance-overview"
                            className="border border-(--separator-default)"
                        >
                            <LeftBarBalanceStats>
                                <LeftBarBalanceItem
                                    label={t('menu_balance_star')}
                                    value={starBalance}
                                />
                                <LeftBarBalanceItem
                                    label={t('menu_balance_usd')}
                                    value={usdBalance}
                                />
                            </LeftBarBalanceStats>
                            <ListSeparator size="medium" />
                            {/*
                             * ## Both halves still lead nowhere, and stay visibly so
                             *
                             * Legacy's card links these to `/get-star` and
                             * `/my-wallet/payout-request`. Neither exists in this app yet —
                             * buying Star and requesting a payout are later passes — so they
                             * keep the repo's rule for a control whose destination is not
                             * built: dimmed and `disabled`, not silently inert.
                             * `channel-owner-actions.tsx` states it, and
                             * `features/balance`'s own action rows follow the same one.
                             *
                             * They are **not** pointed at `/my-star` and `/my-wallet` as a
                             * stand-in. "Get Star" is a purchase, not a balance screen; a
                             * button that says one thing and does another is worse than one
                             * that admits it is not ready.
                             */}
                            <LeftBarBalanceActions>
                                <LeftBarBalanceAction
                                    disabled
                                    title={t('balance_action_unavailable')}
                                >
                                    {t('menu_get_star')}
                                </LeftBarBalanceAction>
                                <LeftBarBalanceRule />
                                <LeftBarBalanceAction
                                    disabled
                                    title={t('balance_action_unavailable')}
                                >
                                    {t('menu_withdraw')}
                                </LeftBarBalanceAction>
                            </LeftBarBalanceActions>
                        </Card>

                        {MENU_SECTIONS.map(section => (
                            <LeftBarSection key={section.label}>
                                <FieldLabel className="h-[32px]">{t(section.label)}</FieldLabel>
                                <LeftBarList
                                    inset={section.inset}
                                    featured={section.featured}
                                    bordered={!section.featured}
                                >
                                    {section.rows.map((row, i) => (
                                        <LeftBarRow
                                            key={row.key}
                                            {...rowAction(row)}
                                            className={MENU_ROW_ACTIVE_CLASS}
                                            rule={i > 0}
                                            title={t(row.key)}
                                            icon={row.icon}
                                            brand={
                                                row.mark ? (
                                                    <Icon {...row.mark} size={32} />
                                                ) : undefined
                                            }
                                            tile={row.tile}
                                            glyph={row.glyph}
                                            // A row that fires in place has nothing to drill into, so
                                            // it loses the chevron the navigating rows carry.
                                            chevron={row.action === undefined}
                                            trailing={rowTrailing(row)}
                                        />
                                    ))}
                                </LeftBarList>
                            </LeftBarSection>
                        ))}
                    </LeftBar>
                </DrawerScreen>

                <DrawerScreen depth="pushed" active={view === 'other-settings'}>
                    <DrawerSubScreen
                        title={t('menu_other_settings')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <LeftBarList bordered>
                            {OTHER_SETTINGS_ROWS.map((row, i) => (
                                <LeftBarRow
                                    key={row.key}
                                    {...rowAction(row)}
                                    className={MENU_ROW_ACTIVE_CLASS}
                                    rule={i > 0}
                                    title={t(row.key)}
                                    icon={row.icon}
                                    tile={row.tile}
                                    chevron={row.valueText === undefined && !row.external}
                                    trailing={
                                        row.external ? (
                                            <Icon name="arrow-up-right-from-square" size={20} />
                                        ) : (
                                            rowTrailing(row)
                                        )
                                    }
                                />
                            ))}
                        </LeftBarList>
                    </DrawerSubScreen>
                </DrawerScreen>

                {/*
                 * Data and storage — the one screen here with no design and no legacy twin, so
                 * its content is whatever the browser can actually be asked (see
                 * `data-storage-screen.tsx`). `active` is passed down rather than read from
                 * context because the measurement is the point: parked screens stay mounted,
                 * and a settings panel nobody opened should not be hitting IndexedDB.
                 *
                 * It is `open &&`, not the layer's own `view === …`: closing the drawer leaves
                 * the view standing (see `menu-state.tsx`), so the screen would count as showing
                 * while it sits inert behind a closed panel — and `openAt` could then slide that
                 * same panel back in with figures measured a session ago, because nothing
                 * changed for the effect to notice.
                 */}
                <DrawerScreen depth="pushed" active={view === 'data-storage'}>
                    <DrawerSubScreen
                        title={t('menu_data_storage')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <DataStorageScreen active={open && view === 'data-storage'} />
                    </DrawerSubScreen>
                </DrawerScreen>

                {/*
                 * Privacy and Security — legacy's own second level, rebuilt over the same rows
                 * (see `privacy-security-screen.tsx`).
                 *
                 * Takes `active`, for the same reason Data and storage does: a parked layer
                 * nobody opened should not spend a request on it. The channel visibility this
                 * screen reports is free (`MyChannelProvider` holds it for the whole app), but
                 * the Password row is not — it asks `GET v1/user-login/`, and ungated that went
                 * out at bootstrap on every page for every signed-in visitor, to answer a
                 * question only someone two levels into this menu has asked.
                 *
                 * `open &&` for the same reason as Data and storage: closing the drawer leaves
                 * the view standing (see `menu-state.tsx`), so the screen would go on counting
                 * as shown while it sits inert behind a closed panel.
                 */}
                <DrawerScreen depth="pushed" active={view === 'privacy-security'}>
                    <DrawerSubScreen
                        title={t('menu_privacy_security')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <PrivacySecurityScreen active={open && view === 'privacy-security'} />
                    </DrawerSubScreen>
                </DrawerScreen>

                {/*
                 * Appearance — Dark / Light / System, the mobile app's screen minus its App Icon
                 * section (see `THEME_OPTIONS`).
                 *
                 * Picking does *not* close the drawer, unlike the language picker: the theme swaps
                 * in CSS with nothing to remount, so staying put lets you see the choice land and
                 * try another. Closing would be throwing the picker away mid-comparison.
                 */}
                <DrawerScreen depth="pushed" active={view === 'appearance'}>
                    <DrawerSubScreen
                        title={t('menu_appearance')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <PickerList
                            label={t('menu_appearance')}
                            options={themeOptions}
                            value={activeTheme}
                            onSelect={setTheme}
                        />
                    </DrawerSubScreen>
                </DrawerScreen>

                {/*
                 * Language — the eight `UI_LOCALES`, flag then name in the language's own words, as
                 * legacy lists them (`iconBtnMenu/menu/content/btnLanguage/menu/content`). Each row
                 * picks rather than drills, so it drops the chevron and carries a check when it is
                 * the active one; the flag takes the `brand` slot, since a flag brings its own paint
                 * and a coloured DS tile behind it would only fight it.
                 */}
                <DrawerScreen depth="pushed" active={view === 'language'}>
                    <DrawerSubScreen
                        title={t('menu_language')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <PickerList
                            label={t('menu_language')}
                            options={languageOptions}
                            value={activeLocale}
                            onSelect={selectLanguage}
                        />
                    </DrawerSubScreen>
                </DrawerScreen>
            </div>

            {/* Outside `LeftBar` only in source order — it portals to the top of the document,
            so the drawer never clips it. Kept mounted so the pending state survives the
            round trip. */}
            <ConfirmDialog
                open={confirmingSignOut}
                onOpenChange={setConfirmingSignOut}
                title={t('auth_logout_title')}
                description={t('auth_logout_description')}
                confirmLabel={t('common_confirm')}
                onConfirm={confirmSignOut}
                pending={isSigningOut}
                destructive
            />
        </>
    )
}
