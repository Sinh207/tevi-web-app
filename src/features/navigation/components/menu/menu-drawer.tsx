'use client'

import { useAccountSwitcher, useAuth, useRequireAuth } from '@features/auth'
import { useBalanceDisplay, useCurrency } from '@features/balance'
import { useFollowRequestsCount, useMyChannel } from '@features/channel'
import { type IdentityState, useIdentityStatus } from '@features/identification'
import { useMiniApp } from '@features/mini-app'
/*
 * The path, from the import-free module — never `@features/payment`'s barrel, which would pull
 * Stripe's loader and the whole checkout graph into the drawer to read one string. Same call
 * `lib/menu-rows.ts` makes for `menu_card_management`.
 */
import { GET_STAR_PATH } from '@features/payment/routes'
import { PAYOUT_REQUEST_PATH } from '@features/payout/routes'
import { usePermission } from '@features/permission'
import { CurrencyList } from '@shared/components/currency-list'
import { PickerList, type PickerOption } from '@shared/components/picker-list'
import { toLocale } from '@shared/i18n/settings'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { NotificationBadge } from '@shared/ui/badge'
import { Card } from '@shared/ui/card'
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
    LeftBarRow,
    LeftBarSection,
} from '@shared/ui/left-bar'
import { ListSeparator } from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { useDrawerNavigate } from '../../hooks/use-drawer-navigate'
import { isPathActive, isViewActive, MENU_ROW_ACTIVE_CLASS } from '../../lib/menu-active'
import {
    MENU_SECTIONS,
    menuRowTestId,
    OTHER_SETTINGS_ROWS,
    type Row,
    THEME_OPTIONS,
} from '../../lib/menu-rows'
import { type DrawerView, useMenu } from '../../providers/menu-state'
import { DataStorageScreen } from './data-storage-screen'
import { DrawerScreen, DrawerSubScreen } from './drawer-screen'
import { MenuProfileCard } from './menu-profile-card'
import { PrivacySecurityScreen } from './privacy-security-screen'

/**
 * The account drawer's content — the DS `Left Bar` (Figma 3626:26373), adapted the way
 * the `My Star — Desktop` comp adapts it for web
 * (claude.ai/design/p/87e00715-ad01-43ad-9a23-20469b60276d):
 *
 *   · a `Personal` heading, since on web the drawer is a panel rather than a screen
 *   · the profile row is `Card type="basic"` unless the account has Premium, where the DS's
 *     purple `premium` card is right and legacy shows it too (see `menu-profile-card.tsx`)
 *   · the balance card takes a visible border
 *   · every row ends in a drilldown chevron
 *   · 24 of top padding instead of the DS's 64 — that 64 is a mobile status-bar inset
 *
 * This file is the composition only. What the rows *are* lives in `lib/menu-rows.ts`, the
 * screen-stack layers and the pick-one list in `drawer-screen.tsx`, the profile card and its
 * three session states in `menu-profile-card.tsx`, and which screen is
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
    const { signOut, isSigningOut, isAuthenticated, isBootstrapping } = useAuth()
    const [confirmingSignOut, setConfirmingSignOut] = useState(false)
    const requireAuth = useRequireAuth()
    const openAccountSwitcher = useAccountSwitcher()
    const { close, open, view, push, pop } = useMenu()
    /*
     * The Mini App Center row. `openCenter` composes `useRequireAuth` itself, so this row needs no
     * gating of its own beyond closing the drawer — see `handleMiniAppCenter`.
     */
    const { openCenter } = useMiniApp()
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
    const { currency, currencies, isListLoading, rate, isRateKnown, selectCurrency } = useCurrency({
        enabled: open,
    })
    const {
        star: starBalance,
        usd: usdBalance,
        isKnown: isBalanceKnown,
    } = useBalanceDisplay({
        currency,
        /*
         * `null`, not the standing-in `1`, until the rate is real — otherwise the first frame after the
         * drawer opens labels a USD figure `₫` and understates a Vietnamese creator's balance by four
         * orders of magnitude. `useBalanceDisplay` prints `—` for it, which is what this drawer already
         * shows for a figure it does not have. `/my-wallet` makes the opposite call on purpose: there the
         * balance is the screen's subject rather than a summary line.
         */
        rate: isRateKnown ? rate : null,
    })
    /*
     * The Follow requests badge. Gated on `open` for the same measured reason as
     * `useIdentityStatus` — this drawer is mounted in the shell on every page, and an ungated
     * query here would be a request at bootstrap for every signed-in visitor to fill in a badge
     * most of them never look at. Unlike the balance, nothing outside this drawer reads it.
     */
    const { count: followRequestCount, isKnown: followRequestCountKnown } = useFollowRequestsCount({
        enabled: open,
    })
    /*
     * `can()` and not `useCapability()`: this is a **list**, and the trade-off between the two is
     * stated once in `features/permission` — a row wants the boolean and a screen wants the four
     * states. Read here rather than in `menu-rows.ts` so that file stays JSX-free and hook-free, which
     * is the same reason the Star figure above is read here.
     */
    const { can } = usePermission()
    /**
     * The MCN row's gate — see `Row.mcnOnly`.
     *
     * `useMyChannel()` costs nothing here: `MyChannelProvider` holds that body app-wide and this
     * drawer is mounted inside it, so this is a context read rather than a request. It is also why
     * the gate can be a fact about the account rather than a fourth query.
     *
     * **Fails closed**, like `can()` above: `myChannel` is `undefined` until the body lands, so the
     * row is absent while the answer is unknown instead of appearing and being taken away. A managed
     * creator sees it a beat late; nobody sees it wrongly.
     */
    const { myChannel } = useMyChannel()
    const isMcnMember = Boolean(myChannel?.mcn) && !myChannel?.mcn?.is_owner
    /*
     * The Space tier row wears the account's own tier, as legacy's `BtnSpaceTier` does: the badge
     * in place of the tile and "Tier N" at the trailing edge. Read off the same my-channel body as
     * the line above, so the row costs no request of its own. Tier 0 is drawn too — unlike a name
     * badge, this row *is* about the tier, and legacy shows tier 0's art here.
     */
    const spaceTier = myChannel?.space_tier ?? null
    const spaceTierImage = myChannel?.space_tier_image ?? null
    /**
     * Whether the drawer should draw its account-scoped half at all — the balance card and every
     * `authOnly` row.
     *
     * `isBootstrapping` counts as a session on purpose. Resolving one is a client-side round trip,
     * so for its duration a returning account looks exactly like a guest; hiding two thirds of the
     * menu and putting it back is the same wrong-identity flash `MenuProfileCard` renders a
     * skeleton to avoid, and it would fire on every cold load. Nothing becomes reachable: those
     * rows carry `requiresAuth`, so pressing one in that window raises the sign-in dialog.
     */
    const hasSession = isAuthenticated || isBootstrapping

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
     * Open the Mini App Center — Tevi's directory of mini apps, which is itself a mini app.
     *
     * Closed first, in both branches, for the reason above: the player is an overlay and the
     * sign-in dialog it raises for a guest is another one, and a drawer left standing behind
     * either stacks two panels on one another. Unlike a sub-screen there is nothing to come back
     * to inside the drawer — the app is the destination.
     *
     * No gate here: `openCenter` composes `useRequireAuth`, so a guest gets the sign-in dialog and
     * no player, and a second check would be the same decision written twice.
     */
    const handleMiniAppCenter = () => {
        close()
        openCenter()
    }

    /**
     * Picking a language applies it and pops back to the root, like every picker in this drawer:
     * the root's Language row carries the active value, so returning to it *is* the confirmation.
     * (Legacy closes the whole drawer here; returning to the menu was asked for instead.)
     *
     * Picking the language that is already active still pops: it is what a picker does,
     * and `changeLanguage` is a no-op cost either way.
     *
     * Not awaited, deliberately. `changeLanguage` is async — the client carries English plus the
     * locale the page was served in, so a third one is a chunk fetch away (7–25 KB, see
     * `i18n/locale-bundles.ts`). The root repaints in the new language the moment the bundle lands.
     */
    const selectLanguage = (code: string) => {
        void changeLanguage(code)
        pop()
    }

    /** Same rule for the theme: apply, then back to the menu the row was pressed on. */
    const selectThemeAndReturn = (value: string) => {
        setTheme(value)
        pop()
    }

    /**
     * Picking a currency pops back to the root rather than closing: what changed is one figure on the card you pressed to get here, so returning to it *is* the
     * confirmation. Closing the drawer would hide the only thing that moved.
     */
    const selectCurrencyAndReturn = (code: string) => {
        selectCurrency(code)
        pop()
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
        if (row.action === 'mini-app-center') {
            return { onClick: handleMiniAppCenter } as const
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
        /*
         * The one row whose trailing content is not text: a red count pill, which is what legacy
         * puts here and what a queue of pending decisions warrants — the number is the reason to
         * press the row, not a description of its current setting.
         *
         * Rendered only when the count is **known and non-zero**: an unfetched count is not
         * entitled to claim zero (see `useFollowRequestsCount`), and the absence of a badge is
         * exactly what zero looks like, so there is nothing to draw either way.
         *
         * Capped at `9+`, as legacy caps it. The pill sits in a row beside a chevron, so its
         * width is not free — and past nine the exact figure stops being the point.
         *
         * The number alone says nothing to a screen reader — "Follow requests, 3" leaves the 3
         * unexplained, and `9+` is not a number at all. So the digits are `aria-hidden` and the
         * sentence is an `sr-only` sibling **inside** the pill.
         *
         * ⚠ Not `aria-label` on the badge, which is what this first shipped as and is silently
         * useless: the pill is a `<span>`, i.e. `role="generic"`, and an accessible name on a
         * generic element is ignored — so that version *removed* the count from the accessible
         * row instead of describing it. `sr-only` text is read as content, which a generic
         * element does contribute. It is clipped, not laid out, so the pill's width is the
         * digits'.
         */
        if (row.key === 'menu_follow_requests') {
            if (!followRequestCountKnown || followRequestCount === 0) return undefined
            return (
                <NotificationBadge type="count" size="small">
                    <span aria-hidden>{followRequestCount > 9 ? '9+' : followRequestCount}</span>
                    <span className="sr-only">
                        {t('menu_follow_requests_pending', { count: followRequestCount })}
                    </span>
                </NotificationBadge>
            )
        }
        if (row.key === 'menu_space_tier') {
            if (spaceTier === null) return undefined
            return (
                <span className="type-dense-default text-(--text-body)">
                    {t('space_tier_tier', { tier: spaceTier })}
                </span>
            )
        }
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
                        data-testid="navigation-menu"
                        as="aside"
                        aria-label={t('menu_title')}
                        className="w-full min-h-full bg-(--background-surface) pt-6"
                    >
                        <h1 className="type-title-t1-bold mb-2 text-(--text-title)">
                            {t('menu_personal')}
                        </h1>
                        <MenuProfileCard />

                        {/*
                         * The balance card is for an account that has one. Legacy renders it only
                         * behind `isAuthenticated` and so does this: signed out, both figures are
                         * `—`, the currency switcher opens a picker over nothing, and Withdraw is a
                         * withdrawal form with no balance behind it — a card whose every field is a
                         * placeholder is worse than the space it takes. The rows below follow the
                         * same rule (see the filter), and `hasSession` keeps the bootstrap window
                         * showing the signed-in shape for the same reason it does there.
                         */}
                        {hasSession && (
                            <Card
                                type="balance-overview"
                                className="border border-(--separator-default)"
                            >
                                <LeftBarBalanceStats>
                                    <LeftBarBalanceItem
                                        /*
                                         * Held at the height of the pill opposite it, so both figures sit
                                         * on one line. The DS draws two plain label strings here; the
                                         * moment one of them becomes a control with a border, the other
                                         * has to match its box or the two columns' values are 4px apart —
                                         * which reads as a rendering slip on a card whose whole job is
                                         * two numbers side by side.
                                         */
                                        label={
                                            <span className="flex h-6 items-center">
                                                {t('menu_balance_star')}
                                            </span>
                                        }
                                        value={starBalance}
                                    />
                                    <LeftBarBalanceItem
                                        /*
                                         * The column's label is the **switcher**, which is where legacy puts
                                         * it (`components/btnCurrency` sits in exactly this slot) and what
                                         * makes the figure below it readable to a creator who is not paid in
                                         * dollars. The DS comp draws a plain `USD` string here; it draws no
                                         * switcher anywhere, and the wallet card's own chip is the same
                                         * app-authored control.
                                         *
                                         * Leading `arrows-repeat`, matching `CurrencyChip` on `/my-wallet` —
                                         * one glyph for "these figures can be shown in another unit" across
                                         * both places it is offered. Not a trailing caret: this is not a
                                         * dropdown, it pushes a screen.
                                         *
                                         * Gated on the *action* like every other account-scoped control in
                                         * this drawer, so a guest gets the sign-in dialog rather than a
                                         * picker over a balance of `—`.
                                         *
                                         * ## It wears a hairline capsule, and that is not decoration
                                         *
                                         * Text plus a glyph was the first cut and it failed the only test
                                         * that matters here: nobody could tell it was pressable, which is
                                         * the whole complaint the control exists to answer. The capsule is
                                         * the app's own — the DS has no chip for a card label — and it is
                                         * built from the tokens the DS *does* define for a neutral press:
                                         * a `--separator-default` hairline at rest, the ghost button's own
                                         * hover fill, and Title ink on hover. Both flip with the theme, so
                                         * this reads the same in Dark, where a `--button-secondary-bg`
                                         * chip would have been the exact colour of the card behind it.
                                         */
                                        label={
                                            <button
                                                data-testid="navigation-menu-currency-trigger"
                                                type="button"
                                                onClick={pushGated('currency')}
                                                aria-label={`${currency.code}, ${t('balance_change_currency')}`}
                                                className={cn(
                                                    'type-dense-default -ms-2 inline-flex h-6 cursor-pointer items-center gap-1',
                                                    'rounded-[var(--radius-fill)] border border-(--separator-default) bg-transparent px-2',
                                                    'text-(--text-body) transition-colors duration-150',
                                                    'hover:border-(--separator-strong) hover:bg-(--button-ghost-bg-hover) hover:text-(--text-title)',
                                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                                                )}
                                            >
                                                <Icon name="arrows-repeat" size={16} />
                                                {currency.code}
                                            </button>
                                        }
                                        /*
                                         * A shimmer, not the em dash, for the one case where the two
                                         * mean different things: the balance is in hand and only the
                                         * *rate* is in flight — which is every first open after picking
                                         * a new currency. `—` is this drawer's word for "we do not have
                                         * this"; a figure that is one request away is not that, and a
                                         * card that blanks and then fills reads as an error that
                                         * corrected itself. The box is reserved at the value's own line
                                         * height (18 × 1.5), so nothing moves when the number lands.
                                         */
                                        value={
                                            isBalanceKnown && !isRateKnown ? (
                                                <span className="flex h-[27px] items-center">
                                                    <Skeleton w={96} />
                                                </span>
                                            ) : (
                                                usdBalance
                                            )
                                        }
                                    />
                                </LeftBarBalanceStats>
                                <ListSeparator size="medium" />
                                {/*
                                 * ## Both halves lead somewhere
                                 *
                                 * Legacy's card links these to `/get-star` and
                                 * `/my-wallet/payout-request`, and both screens exist here now, so both
                                 * are real `<a>`s through the same handlers the rows above use: close
                                 * the drawer, then push. Without the close, the reader lands on the
                                 * destination with the drawer still over it, which is the bug
                                 * `handleSwitchAccount` documents for dialogs.
                                 *
                                 * The two handlers differ, and it is the screen behind each that
                                 * decides which. `/get-star` shows its prices to a guest and gates the
                                 * **press**, so `navigate` sends anybody there and the page works.
                                 * `/my-wallet/payout-request` is a withdrawal form over a bearer — a
                                 * guest has no balance, no methods and no quote — so it takes
                                 * `navigateGated`: pressing it signed out raises the sign-in dialog
                                 * instead of navigating away. Gated on the **action**, not the route;
                                 * a modified click still opens the URL and the page handles the guest.
                                 *
                                 * Withdraw was `disabled` here while `features/payout` was unbuilt.
                                 * That is the repo's rule for a control with no destination
                                 * (`channel-owner-actions.tsx`), and it stops applying the moment the
                                 * destination lands — `/my-wallet`'s own action row already links to
                                 * this same path.
                                 */}
                                <LeftBarBalanceActions>
                                    <LeftBarBalanceAction
                                        data-testid="navigation-menu-get-star"
                                        href={GET_STAR_PATH}
                                        onClick={navigate(GET_STAR_PATH)}
                                    >
                                        {t('menu_get_star')}
                                    </LeftBarBalanceAction>
                                    <LeftBarBalanceRule />
                                    <LeftBarBalanceAction
                                        data-testid="navigation-menu-withdraw"
                                        href={PAYOUT_REQUEST_PATH}
                                        onClick={navigateGated(PAYOUT_REQUEST_PATH)}
                                    >
                                        {t('menu_withdraw')}
                                    </LeftBarBalanceAction>
                                </LeftBarBalanceActions>
                            </Card>
                        )}

                        {MENU_SECTIONS.map(section => {
                            /*
                             * Two filters, and a section that loses all of its rows drops its
                             * heading with them — otherwise SERVICES would render as a label with
                             * nothing under it for every ordinary creator, and a signed-out drawer
                             * would carry six empty headings.
                             *
                             * `authOnly` drops the rows a guest has no account to use, which is
                             * legacy's own table (`Row.authOnly` carries the list and the reasoning).
                             * It reads `hasSession`, not `isAuthenticated`, so the bootstrap window
                             * shows the signed-in set: the session is resolved on the client, so a
                             * returning account is briefly indistinguishable from a guest, and
                             * collapsing the menu to four rows and back on every cold load is the
                             * same flash `MenuProfileCard` renders a skeleton to avoid. Nothing is
                             * reachable in that window that would not be anyway — every one of those
                             * rows carries `requiresAuth`, so the press is gated regardless.
                             *
                             * `can()` **fails closed**, so a row is hidden while the grants are still
                             * loading and stays hidden if the request failed. That is the documented
                             * trade for a list (`features/permission`): an unlisted row costs nothing,
                             * where a listed one leads to a screen the backend would refuse. The
                             * screen behind it makes the opposite call, because there a wrong denial
                             * is the whole bug.
                             */
                            const rows = section.rows.filter(
                                row =>
                                    (!row.authOnly || hasSession) &&
                                    (!row.capability || can(row.capability)) &&
                                    /*
                                     * The third gate, and the only one that reads the account's own
                                     * body rather than a session or a grant: MCN Partnership is
                                     * listed only for a creator a network manages. Legacy's own
                                     * condition — `Row.mcnOnly` carries it and the reasoning.
                                     */
                                    (!row.mcnOnly || isMcnMember),
                            )
                            if (rows.length === 0) return null
                            return (
                                <LeftBarSection
                                    data-testid="navigation-menu-section"
                                    data-row-key={section.label}
                                    key={section.label}
                                >
                                    <FieldLabel className="h-[32px]">{t(section.label)}</FieldLabel>
                                    <LeftBarList
                                        inset={section.inset}
                                        featured={section.featured}
                                        bordered={!section.featured}
                                    >
                                        {rows.map((row, i) => (
                                            <LeftBarRow
                                                data-testid="navigation-menu-row"
                                                data-row-key={menuRowTestId(row)}
                                                key={row.key}
                                                {...rowAction(row)}
                                                className={MENU_ROW_ACTIVE_CLASS}
                                                rule={i > 0}
                                                title={t(row.key)}
                                                icon={row.icon}
                                                brand={
                                                    row.mark ? (
                                                        <Icon {...row.mark} size={32} />
                                                    ) : row.key === 'menu_space_tier' &&
                                                      spaceTierImage ? (
                                                        /* The tile's 32px box, height-led: the
                                                           marks are not square. */
                                                        <Image
                                                            src={spaceTierImage}
                                                            alt=""
                                                            width={64}
                                                            height={64}
                                                            style={{ height: 32 }}
                                                            className="w-auto"
                                                        />
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
                            )
                        })}
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
                                    data-testid="navigation-menu-other-row"
                                    data-row-key={menuRowTestId(row)}
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
                 * Picking pops back to the root, as every picker in this drawer does.
                 */}
                <DrawerScreen depth="pushed" active={open && view === 'appearance'}>
                    <DrawerSubScreen
                        title={t('menu_appearance')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <PickerList
                            testId="navigation-menu-appearance"
                            label={t('menu_appearance')}
                            options={themeOptions}
                            value={activeTheme}
                            onSelect={selectThemeAndReturn}
                            /*
                             * A pushed screen stays **mounted** while parked, so the list has to be
                             * told when it is the one on screen — otherwise its scroll-to-selection
                             * runs against a drawer nobody is looking at. Three rows never scroll, so
                             * this is belt and braces here and load-bearing on Language.
                             */
                            active={view === 'appearance'}
                        />
                    </DrawerSubScreen>
                </DrawerScreen>

                {/*
                 * Currency — the exchange service's list, reached from the balance card's own label
                 * rather than from a settings row (`DrawerView` notes why). Legacy opens a dialog from
                 * that press; a pushed screen is this drawer's equivalent, and it is the same
                 * back-arrow-and-centred-title header legacy's dialog has.
                 */}
                <DrawerScreen depth="pushed" active={view === 'currency'}>
                    <DrawerSubScreen
                        title={t('balance_change_currency')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <CurrencyList
                            testId="navigation-menu-currency"
                            active={open && view === 'currency'}
                            currencies={currencies}
                            selected={currency}
                            isLoading={isListLoading}
                            onSelect={selectCurrencyAndReturn}
                            /* The App Bar above it is sticky at 0 and a fixed `h-[60px]`, so the
                               field sits exactly under it with no gap for rows to show through. */
                            stickyClassName="top-[60px]"
                            /* Cancels `DrawerSubScreen`'s own 16px column gap. The field carries its
                               own 12px above the pill (it has to — see the note there), and the two
                               together put 28px under the App Bar at rest and 12px once the list
                               scrolls, i.e. the header would appear to grow as you scrolled it. */
                            className="-mt-4"
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
                <DrawerScreen depth="pushed" active={open && view === 'language'}>
                    <DrawerSubScreen
                        title={t('menu_language')}
                        backLabel={t('common_back')}
                        onBack={pop}
                    >
                        <PickerList
                            testId="navigation-menu-language"
                            label={t('menu_language')}
                            options={languageOptions}
                            value={activeLocale}
                            onSelect={selectLanguage}
                            // Eight locales in a panel that can be shorter than they are — see above.
                            active={view === 'language'}
                        />
                    </DrawerSubScreen>
                </DrawerScreen>
            </div>

            {/* Outside `LeftBar` only in source order — it portals to the top of the document,
            so the drawer never clips it. Kept mounted so the pending state survives the
            round trip. */}
            <ConfirmDialog
                testId="navigation-menu-sign-out-confirm"
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
