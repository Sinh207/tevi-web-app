'use client'

import {
    accountAvatarUrl,
    accountDisplayName,
    accountNsfwSettings,
    accountUserId,
    LoginScreen,
    useAuth,
    useUpdateMe,
} from '@features/auth'
import { AvatarStill } from '@shared/components/avatar-still'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import { Toggle } from '@shared/ui/toggle'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { NSFW_ROWS } from './nsfw-rows'

/**
 * `/app/privacy-settings` — the mobile app's account privacy screen, rebuilt.
 *
 * Legacy: `../tevi-web-app/src/containers/app/privacySettings`. Same three parts in the same
 * order — who you are signed in as, the three `nsfw_settings` switches, a way out — because the
 * native app frames this screen and its own header already names it.
 *
 * ── what is deliberately different ────────────────────────────────────────────────────────────
 *
 * **It has a theme.** Legacy paints `#141414`, `#666666`, `#848484`, `#FFFFFF` and `#ef4444` by
 * hand, so the screen is white in an app that is in dark mode — while the app is *already
 * telling us* which mode it is in on the URL (`?theme=dark`, see `shared/config/webview.ts`).
 * Semantic tokens only here, so the answer the app sends is the answer the screen paints.
 *
 * **It has a language.** Every string in legacy is a hard-coded English literal, in a screen the
 * app opens with `?lang=vi`. All of it goes through `useTranslation()`.
 *
 * **It is sized by the viewport, not by a number.** Legacy sets
 * `width: ${window.innerWidth}px; height: ${window.innerHeight}px` — which is why the page is
 * `ssr: false` — and both are stale the moment the device rotates or the keyboard opens. The
 * `/app/*` shell already reserves the safe area, so this is `flex-1` inside it.
 *
 * **The switches move before the server answers.** Legacy covers the list with a translucent
 * spinner for the whole round trip: you press a switch, a spinner appears over the thing you
 * pressed, and half a second later the switch agrees. `useUpdateMe` patches the cache first and
 * rolls back on failure, so the switch moves under the finger.
 *
 * **No account is a state with a way out of it.** Legacy renders the card with `undefined` in it,
 * three switches that all read off, and a Log out button with nothing to log out of. Here the
 * three states — bootstrapping, no account, an account — are each drawn, and the middle one *is*
 * `/login`: the same `LoginScreen` the website uses, in place of the settings rather than a
 * dialog over them. A modal is for interrupting something; here there is nothing behind it to
 * protect, and eight sign-in methods are the whole content of the screen until there is an
 * account.
 *
 * It is passed `webview`, which is not decoration: `LoginScreen`'s footer otherwise links to
 * `/signup`, `/terms` and `/privacy` — **website** URLs, so tapping one inside the app's WebView
 * lands on the public site with the full web shell, navbar and all. That flag points the two legal
 * links at their `/app/*` twins, drops the sign-up line (every provider on the card creates an
 * account on first use, which is why `/signup` is social-only anyway), and is what tells
 * `AuthLayout` to take its height from this shell instead of the viewport.
 *
 * ## The card is `/me`, not the channel
 *
 * This subtree mounts `AuthProvider` alone, so there is no `myChannel` — see `layout.tsx`. Legacy
 * draws the space's name, `@slug` and verified badge here, all three of which are channel fields;
 * what is left is the account's own display name, avatar and user id, which is what this screen is
 * about. Do not reach for the slug with a bare fetch: the honest way back is
 * `MyChannelProvider` beside `AuthProvider` in the layout.
 *
 * ── the one thing this cannot do ───────────────────────────────────────────────────────────────
 *
 * **Signing out here does not tell the native app.** `signOut()` clears the same-origin token
 * store and re-establishes an anonymous session; the app's own session state is its own, and
 * there is no bridge to it (`features/mini-app` is the opposite direction — our page hosting
 * theirs). Legacy has exactly the same hole and shipped with it, so this is parity rather than a
 * regression, and the button stays because it is the only way out of a WebView the app opens
 * without one. If the app team wants the callback, it is one `postMessage` in `confirmSignOut`
 * and a contract in `docs/WEBVIEW.md`.
 */

export function PrivacySettingsScreen() {
    const { t } = useTranslation()
    const { currentUser, isAuthenticated, isBootstrapping, isSigningOut, signOut } = useAuth()
    const { update, isPending } = useUpdateMe()
    const [confirmingSignOut, setConfirmingSignOut] = useState(false)
    const noteId = useId()

    const settings = accountNsfwSettings(currentUser)
    /*
     * Two kinds of unavailable, and `Toggle` treats them differently on purpose. `aria-disabled`
     * while a write is in flight: the endpoint answers with the whole profile, so two overlapping
     * writes overwrite each other's field (`useUpdateMe`), and it has to be the soft form because
     * the switch just pressed is the focused element — `disabled` would blur it and drop the
     * keyboard to the top of the document on every toggle.
     */
    const pending = isPending || undefined

    /**
     * `signOut` does not end at "no session" — it re-establishes an anonymous one, so the screen
     * falls to its sign-in branch rather than to nothing. Failure is swallowed for the reason
     * the drawer's copy of this gives: `signOut` already tolerates a failed `/logout` (the local
     * tokens go either way), so the only thing left that can throw is minting the replacement
     * anonymous session, and a toast about that is about our plumbing, not about the thing they
     * asked for — which did happen.
     */
    async function confirmSignOut() {
        try {
            await signOut()
        } catch {
            // Nothing left to do; the tokens are gone either way.
        }
        setConfirmingSignOut(false)
    }

    /*
     * Three states, three returns, in the order the session resolves them.
     *
     * `LoginScreen` **replaces** this screen rather than rendering inside it: it brings its own
     * `<main>` (one per document), its own `h1`, and the brand lock-up the settings list has no use
     * for. `webview` is the one thing it has to be told — the height, the legal links and the
     * sign-up line all follow from it; see the prop's own note.
     *
     * The bootstrap check comes **first** because the session resolves on the client: a returning
     * account is momentarily indistinguishable from a guest, and flashing a sign-in page at
     * somebody who is already signed in is worse than a moment of skeleton. An anonymous session
     * then lands in the second branch — `isAuthenticated` is already `id && !anonymous`, and every
     * visitor carries one.
     */
    if (isBootstrapping) {
        return (
            <Shell>
                <PrivacySettingsSkeleton />
            </Shell>
        )
    }
    if (!isAuthenticated) return <LoginScreen webview />

    return (
        <Shell>
            <Card type="basic" className="items-center">
                <AccountAvatar src={accountAvatarUrl(currentUser)} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="type-body-strong min-w-0 truncate text-(--text-title)">
                        {accountDisplayName(currentUser) ?? t('auth_switcher_unnamed')}
                    </span>
                    <IdLine id={accountUserId(currentUser)} />
                </div>
            </Card>

            <div className="flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)">
                {NSFW_ROWS.map((row, index) => (
                    <ListRow
                        data-testid="privacy-settings-row"
                        data-row-key={row.field}
                        key={row.field}
                        rightAction
                    >
                        {/* No `ListRowLeading`: legacy's rows carry no glyph, so the rule runs the
                            content's full width instead of starting after a 48px leading slot that
                            is not there. */}
                        <ListRowContent>
                            {index > 0 && <ListRowRule />}
                            {/* `rightAction` on both — without it `ListRowText` takes `w-full` and
                                a long label pushes the switch off the row. */}
                            <ListRowAccessory rightAction>
                                <ListRowText rightAction>
                                    <ListRowTitleRow>
                                        <ListRowTitle>{t(row.titleKey)}</ListRowTitle>
                                    </ListRowTitleRow>
                                    {/* The explanation is a subtitle, not a tooltip: this screen is
                                        only ever opened on a phone, where a tooltip is
                                        unreachable. */}
                                    <ListRowSubtitle id={`${noteId}-${row.field}`}>
                                        {t(row.noteKey)}
                                    </ListRowSubtitle>
                                </ListRowText>
                                <ListRowTrailing variant="toggle">
                                    <Toggle
                                        data-testid="privacy-settings-toggle"
                                        data-row-key={row.field}
                                        checked={settings[row.field] === true}
                                        aria-disabled={pending}
                                        // The row is a `div`, so nothing else is announcing the
                                        // title or the sentence under it.
                                        aria-label={t(row.titleKey)}
                                        aria-describedby={`${noteId}-${row.field}`}
                                        onCheckedChange={next =>
                                            update({
                                                // Sent whole: the endpoint replaces the object, so
                                                // its siblings have to come back with it or they
                                                // are cleared.
                                                nsfw_settings: { ...settings, [row.field]: next },
                                            })
                                        }
                                    />
                                </ListRowTrailing>
                            </ListRowAccessory>
                        </ListRowContent>
                    </ListRow>
                ))}
            </div>

            {/*
             * `mt-auto` — legacy's `mt: 'auto'`: the way out belongs at the bottom of the screen,
             * not under the last row, so a two-row screen does not put it in the middle.
             * `secondary` is the DS's outlined button, which is the shape legacy draws; the
             * destructive *ink* comes from the class, since the DS's `destructive` variant is a
             * filled red button and a filled red button at the foot of a settings screen reads as
             * the primary action.
             */}
            <Button
                data-testid="privacy-settings-sign-out"
                id="app-privacy-logout-btn"
                variant="secondary"
                size="large"
                fullWidth
                className="mt-auto border-(--text-error) text-(--text-error)"
                onClick={() => setConfirmingSignOut(true)}
            >
                {t('menu_logout')}
            </Button>

            {/*
             * Asks first, as the website's drawer does. Legacy signs out on the first press, and in
             * a WebView that is the worst place for it: the button sits at the bottom of the screen
             * where a thumb rests, and re-establishing the session means leaving the app, signing
             * in on the web, and coming back.
             */}
            <ConfirmDialog
                testId="privacy-settings-sign-out-confirm"
                open={confirmingSignOut}
                onOpenChange={setConfirmingSignOut}
                title={t('auth_logout_title')}
                description={t('auth_logout_description')}
                confirmLabel={t('common_confirm')}
                onConfirm={confirmSignOut}
                pending={isSigningOut}
                destructive
            />
        </Shell>
    )
}

/**
 * The frame both settings states share: the column, and the heading the document needs.
 *
 * **The column is capped at the `sm` breakpoint (612), centred.** Legacy caps it too —
 * `<Container maxWidth='sm'>`, so 600 — and it matters for the same reason there: the app opens
 * this in a WebView on tablets as well as phones, and an uncapped list puts the title at the far
 * left of a 1024px iPad with its switch at the far right, a thumb's travel away from the words it
 * belongs to.
 *
 * `flex-1`, not a viewport height: the `/app/*` shell already reserves the safe-area insets, and a
 * second full-viewport box inside them overflows by exactly that much — the trap
 * `app/app/privacy/page.tsx` documents and the reason `LoginScreen` is passed `webview`.
 *
 * The `h1` is `sr-only`, and this is the one place in the app where that is the right call: the
 * native app draws its own header with this screen's name in it, so a visible title would be the
 * same words twice, three pixels apart. The document still needs a heading — `/app/privacy` keeps a
 * visible one because a legal document's title *is* its first line of content; a settings list's is
 * chrome, and the chrome is native.
 */
function Shell({ children }: { children: ReactNode }) {
    const { t } = useTranslation()
    return (
        <main className="mx-auto flex w-full max-w-(--breakpoint-sm) flex-1 flex-col gap-4 p-4">
            <h1 className="sr-only">{t('privacy_settings_title')}</h1>
            {children}
        </main>
    )
}

/**
 * The account's face at 48 — the still, not the animated one.
 *
 * `AnimatedAvatar` is deliberately not used: the clip and the Premium flag that gates it are both
 * **channel** fields (`myChannel.images.avatar_video`, `is_premium`), and this subtree has no
 * channel — see `layout.tsx`. Passing `isPremium={false}` to it would render exactly this and
 * imply the video was considered and declined.
 *
 * `alt=""`: the name is beside it in text, so announcing the portrait as well is the same fact
 * twice. Hosts are allow-listed in `next.config.ts`, so the URL goes straight to `next/image`.
 *
 * No initials fallback, deliberately: the placeholder glyph is what every other avatar in this app
 * falls back to (the drawer's card passes no `initials` either), and one screen inventing a second
 * answer for "no photo" is how two surfaces come to disagree about the same account.
 */
function AccountAvatar({ src }: { src: string | null }) {
    // A picture that fails to load gets the same placeholder as no picture — see `AvatarStill`.
    return <AvatarStill src={src} size="large" px={48} />
}

const TOAST_ID = 'app-privacy-copy-id'

/**
 * `ID: 12345`, with a control that copies it — legacy's `app-privacy-copy-user-id-btn`.
 *
 * `—` while the id is unknown, the same answer the drawer's card gives: the id is not a thing to
 * guess at, and it is what gets copied. The button is not rendered at all without one, so the
 * gesture can never put nothing on the clipboard.
 *
 * Two confirmations for the two people reading: a toast states the fact, and the glyph becomes a
 * tick for two seconds for the eye already on the pointer — the same pairing as every other copy
 * affordance in this app. The failure branch is real rather than padding: `navigator.clipboard`
 * does not exist on an insecure origin and can be refused by permissions policy, and a WebView is
 * where that is most likely, so the toast carries the id for selecting by hand.
 *
 * ⚠ `pages` is this repo's copy glyph — the sprite has no `copy`.
 */
function IdLine({ id }: { id: string | null }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    // The timeout outlives the component if the app closes the WebView within two seconds.
    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        if (!id) return
        try {
            await navigator.clipboard.writeText(id)
            toast.success(t('menu_id_copied'), { id: TOAST_ID })
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error(t('menu_id_copy_failed', { id }), { id: TOAST_ID })
        }
    }

    return (
        <span className="type-dense-default flex min-w-0 items-center gap-1 text-(--text-body)">
            <span className="min-w-0 truncate">{t('menu_profile_id', { id: id ?? '—' })}</span>
            {id && (
                <button
                    data-testid="privacy-settings-copy"
                    type="button"
                    onClick={copy}
                    aria-label={t('menu_copy_id')}
                    className={cn(
                        'relative flex flex-none cursor-pointer items-center rounded-(--radius-sm) transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                        copied ? 'text-(--text-success)' : 'text-(--text-link)',
                        // 16px of ink in a 24px target, without a 24px line: the pseudo-element
                        // takes the pointer area WCAG 2.5.8 asks for and the layout keeps its 16.
                        "after:absolute after:-inset-1 after:content-['']",
                    )}
                >
                    <Icon name={copied ? 'check' : 'pages'} weight="filled" size={16} aria-hidden />
                </button>
            )}
        </span>
    )
}

/**
 * The shape while the session resolves — the real geometry, not a grey block: a 48 avatar in a
 * 16-padded card, and three rows built from the same `ListRow` parts the real ones are, so nothing
 * moves when the answer lands (`docs/DEFINITION_OF_DONE.md` §1).
 *
 * Worth drawing at all because this screen's session is resolved on the client and the WebView
 * opens on it directly: without it the app's own header sits above an empty white area for the
 * length of a `/me`.
 */
function PrivacySettingsSkeleton() {
    return (
        <div aria-busy="true" className="flex flex-col gap-4">
            <Card type="basic" className="items-center">
                <Skeleton w={48} h={48} circle />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Skeleton w={140} h={24} />
                    <Skeleton w={96} h={21} delay={160} />
                </div>
            </Card>
            <div className="flex flex-none flex-col overflow-hidden rounded-xl bg-(--background-surface)">
                {NSFW_ROWS.map((row, index) => (
                    <ListRow key={row.field} rightAction>
                        <ListRowContent>
                            {index > 0 && <ListRowRule />}
                            <ListRowAccessory rightAction>
                                <ListRowText rightAction>
                                    <ListRowTitleRow>
                                        <Skeleton w={160} delay={index * 160} />
                                    </ListRowTitleRow>
                                    <Skeleton w={220} delay={index * 160} />
                                </ListRowText>
                                {/* The switch is not drawn: it is present the whole time and
                                    never changes size, so shimmering it animates chrome. */}
                            </ListRowAccessory>
                        </ListRowContent>
                    </ListRow>
                ))}
            </div>
        </div>
    )
}
