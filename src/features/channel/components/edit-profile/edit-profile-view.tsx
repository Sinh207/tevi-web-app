'use client'

import { accountDob, accountEmail, useAuth, useRequireAuth } from '@features/auth'
import { TextAreaField, TextField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { Toggle } from '@shared/ui/toggle'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { PendingUploads } from '../../hooks/use-save-profile'
import { useSaveProfile } from '../../hooks/use-save-profile'
import { useSlugCheck } from '../../hooks/use-slug-check'
import { toChannelPath } from '../../lib/channel-slug'
import { CHANNEL_SETTINGS_CONTAINER, PROFILE_PANEL } from '../../lib/container'
import {
    DESCRIPTION_MAX,
    isProfileDirty,
    maxDateOfBirth,
    NAME_MAX,
    NAME_RULES,
    nameRuleFailures,
    type ProfileValues,
    profileFormErrors,
    profileValuesFromChannel,
} from '../../lib/profile-form'
import { useMyChannel } from '../../providers/my-channel-provider'
import { ChannelEmptyState } from '../channel-empty-state'
import { ProfileCategoriesField } from './profile-categories-field'
import { ProfileDateField } from './profile-date-field'
import { ProfileMediaFields } from './profile-media-fields'
import { ProfileSocialLinksField } from './profile-social-links-field'
import { ProfileTopBar } from './profile-top-bar'

/**
 * `/settings/custom-profile` — the creator's own space, edited.
 *
 * Legacy: `containers/channel/.../creator/components/customProfile`, a drawer over the channel
 * page. This is a **route** instead, and the change is deliberate: the drawer has no URL, so it
 * cannot be linked, cannot be returned to after a sign-in prompt, and loses everything typed into
 * it if the page behind it navigates. Every other settings screen in this app is a route
 * (`/settings/space-visibility`, `/settings/blocked-accounts`, `/settings/password`) and this one
 * has more state to lose than all three.
 *
 * ## One `values` object, not eleven `useState`s
 *
 * Legacy holds each field as `{ value, error, msg, errors }` — eight of those, plus five more for
 * files and dialogs — and computes "is the save button enabled" from a 24-entry dependency array.
 * Here the form is one `ProfileValues`, the initial snapshot is another, and *dirty* is a
 * comparison between them (`isProfileDirty`). That is the entire reason the diff is testable, and
 * it is what makes the Save button's rule statable in one line rather than inferred from a list.
 *
 * Errors are kept out of the value object on purpose, in three separate places according to who
 * knows them: **local rules** are derived on render (`profileFormErrors`), the **username check**
 * is its own hook because it is asynchronous and abortable, and **server rejections** live in the
 * save mutation because that is what produces them.
 *
 * ## The action is gated, not the route
 *
 * Signed out gets a prompt with a sign-in button, not a redirect — the app's rule everywhere
 * (`CLAUDE.md`), and `SpaceVisibilityView` documents the same three fallback states this screen
 * mirrors: signed out, failed read, and signed in with no channel.
 */
export function EditProfileView() {
    const { t } = useTranslation()
    const router = useRouter()
    const { currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const { myChannel, isLoading, isError, refresh, isPremium } = useMyChannel()

    /**
     * The form's starting point, rebuilt whenever the loaded channel changes identity.
     *
     * Keyed on the channel's `id` and its `updated`-ness via the object reference: a refetch that
     * returns the same data leaves this alone (same reference from the query cache), while a save
     * or an account switch replaces it. Legacy re-seeds every field from a `useEffect` on
     * `myChannel` and consequently **discards whatever the person had typed** any time that query
     * refetched — on window focus, after a mutation elsewhere, on a reconnect.
     */
    const initial = useMemo<ProfileValues | null>(
        () =>
            myChannel ? profileValuesFromChannel(myChannel, accountDob(currentUser) ?? '') : null,
        [myChannel, currentUser],
    )

    const [values, setValues] = useState<ProfileValues | null>(initial)
    const [pending, setPending] = useState<PendingUploads>({})

    /*
     * Seed the editable copy **once per channel**, not on every `initial` change.
     *
     * `initial` is recomputed whenever the query hands back a new object, which includes a
     * background refetch of identical data. Re-seeding on that would wipe the form mid-edit —
     * exactly legacy's bug. So the identity that matters is the channel's id: a different space
     * (an account switch) is a different form; the same space refetched is not.
     */
    const seeded = useRef<string | null>(null)
    useEffect(() => {
        if (!myChannel || !initial) return
        if (seeded.current === myChannel.id) return
        seeded.current = myChannel.id
        setValues(initial)
        setPending({})
    }, [myChannel, initial])

    const { save, isSaving, fieldErrors, clearFieldError, savedChannel } = useSaveProfile(
        initial,
        myChannel?.id,
    )
    const slugCheck = useSlugCheck(values?.slug ?? '', initial?.slug ?? '')

    const dirty = Boolean(initial && values && isProfileDirty(initial, values))
    const localErrors = values ? profileFormErrors(values, initial) : {}
    const canSave =
        dirty && !isSaving && Object.keys(localErrors).length === 0 && slugCheck.status !== 'taken'

    /**
     * The browser's own "leave site?" prompt, and it is the only unsaved-changes guard here.
     *
     * An in-app confirmation on route changes would need to intercept the App Router's
     * navigation, which Next does not expose — the workarounds all involve patching history or
     * wrapping every `Link`, and a half-working guard is worse than a documented single one.
     * `beforeunload` covers the closed tab and the typed URL, which are the two ways a long form
     * is most often lost.
     */
    useEffect(() => {
        if (!dirty || isSaving) return
        const warn = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
    }, [dirty, isSaving])

    /**
     * What happens after a save lands: re-seed the form, drop the uploads, and follow the URL if
     * the username moved.
     *
     * ## Re-seeding is not tidiness — without it the form stays permanently dirty
     *
     * A picked picture lives in `values.images` as a `blob:` preview. Once the save succeeds the
     * channel carries the **uploaded** URL, so `initial` and `values` disagree about that field
     * forever: the Save button stays enabled, and pressing it again re-uploads the same bytes
     * under a new key. Re-seeding from the saved channel is what closes that loop, and clearing
     * `pending` is what stops the second upload.
     *
     * `handled` guards it to **once per result**. `savedChannel` is the mutation's own data and
     * outlives the request, so an effect keyed on it alone would re-seed — discarding whatever
     * had been typed since — every time `currentUser` changed for an unrelated reason.
     *
     * ## The redirect reads the slug the form *started* with
     *
     * Not `initial.slug`: by the time this runs, the cache has been written and `initial` is
     * derived from the saved channel, so the comparison would always be false. `submittedFrom`
     * captures the old one at submit time, which is the only place it still exists.
     *
     * `replace`, not `push` — the profile at the old URL is gone, and leaving it in the history
     * means Back lands on a 404.
     */
    /** The username the current attempt started from — see the redirect note above. */
    const submittedFrom = useRef<string | null>(null)
    const handled = useRef<unknown>(null)
    useEffect(() => {
        if (!savedChannel || handled.current === savedChannel) return
        handled.current = savedChannel

        setValues(profileValuesFromChannel(savedChannel, accountDob(currentUser) ?? ''))
        setPending({})
        // Keep the seed guard in step, or the effect above would re-seed from `initial` next
        // render and undo this.
        seeded.current = savedChannel.id

        const from = submittedFrom.current
        if (savedChannel.slug && from && savedChannel.slug !== from) {
            router.replace(toChannelPath(savedChannel.slug))
        }
    }, [savedChannel, currentUser, router])

    /**
     * Save lives **in the bar**, so it is on screen without a sticky footer under the form.
     *
     * ## Why the button is not a `type="submit"`
     *
     * It sits outside the `<form>` — the bar is above it, not in it. HTML's `form="…"` attribute
     * would bridge that, but `AppBarButton` renders `type="button"` by design (it is the DS's bar
     * action, not a form control), so both paths call the same `submit()` instead. Enter in a text
     * field still submits the form natively; nothing about that changed.
     *
     * `AppBarButton type="text-primary"` is the DS's own label action for this bar —
     * `--button-accent-bg` on `--button-accent-text`, 44 tall, radius fill — rather than a
     * `Button` shrunk to fit. `/dev/app-bar` draws it beside the other types.
     */
    function submit() {
        if (!canSave || !values || !initial) return
        // Captured here because it stops existing the moment the save lands — see the redirect
        // effect above.
        submittedFrom.current = initial.slug
        save({ values, pending })
    }

    /**
     * The bar and the column, around whichever body this render produces.
     *
     * A function rather than four copies because **every** state needs the bar: the skeleton, the
     * signed-out prompt and the two failure screens all have to be leavable, and a screen whose
     * only way back appears once its data loads is a trap. The page used to render the bar itself,
     * which stopped working once the bar had to carry form state — see `ProfileTopBar` for why it
     * is composed there rather than reusing `PageBackBar`.
     */
    const shell = (body: ReactNode, save?: { label: string; canSave: boolean }) => (
        <>
            {/* Opaque, or the form scrolls through the bar — `AppBar` deliberately paints no
                background of its own (it is drawn over a screen in Figma). */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <ProfileTopBar saveLabel={save?.label} canSave={save?.canSave} onSave={submit} />
            </div>
            <div className={cn(CHANNEL_SETTINGS_CONTAINER, 'flex flex-1 flex-col')}>{body}</div>
        </>
    )

    // ── the states before the form ────────────────────────────────────────────────────────

    if (isBootstrapping || isLoading || (myChannel && !values)) {
        return shell(<EditProfileSkeleton />)
    }

    if (!isAuthenticated) {
        return shell(
            <ChannelEmptyState
                icon="user-simple-alt"
                title={t('channel_signed_out_title')}
                // `flex-1` **and** the panel: the empty state centres itself in the space it has,
                // and from md that space is the panel rather than the bare column.
                className={cn('flex-1', PROFILE_PANEL, RISE)}
                action={
                    <Button variant="primary" size="large" onClick={requireAuth(() => {})}>
                        {t('auth_sign_in')}
                    </Button>
                }
            />,
        )
    }

    if (isError) {
        return shell(
            <div className={cn('px-3 pt-3 pb-6 md:px-6 md:pt-6', PROFILE_PANEL, RISE)}>
                <Alert status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('channel_error_title')}</AlertTitle>
                        <AlertSubtitle>{t('channel_error_body')}</AlertSubtitle>
                        <AlertActions>
                            <Button variant="secondary" size="small" onClick={() => refresh()}>
                                <Icon name="arrow-rotate-right" size={20} />
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            </div>,
        )
    }

    /*
     * Signed in, no channel. Normally unreachable — `MyChannelProvider` shows the onboarding gate
     * instead of every route in this state — so this is the fallback for the one way past it, the
     * query erroring while `onboardingGate` reads that as "we do not know". Same copy, same
     * reasoning, as `SpaceVisibilityView` and `MySpaceRedirect`.
     */
    if (!myChannel || !values || !initial) {
        return shell(
            <ChannelEmptyState
                icon="user-sparkles-alt"
                title={t('channel_no_channel_title')}
                body={t('channel_no_channel_body')}
                className={cn('flex-1', PROFILE_PANEL, RISE)}
                action={
                    <Button variant="secondary" size="large" onClick={() => refresh()}>
                        <Icon name="arrow-rotate-right" size={20} />
                        {t('common_retry')}
                    </Button>
                }
            />,
        )
    }

    // ── the form ──────────────────────────────────────────────────────────────────────────

    const patch = (next: Partial<ProfileValues>) => setValues(current => ({ ...current!, ...next }))
    const nameFailures = nameRuleFailures(values.name)
    const email = accountEmail(currentUser)

    return shell(
        <form
            className="flex flex-1 flex-col pb-6"
            onSubmit={event => {
                event.preventDefault()
                submit()
            }}
        >
            <div className={PROFILE_PANEL}>
                {/* The clip lives here rather than on the panel: the cover fills the full width
                    with square corners of its own, and the panel cannot be a clipping box any more
                    now that the sticky action bar is inside it. See `PROFILE_PANEL`. */}
                <div className="overflow-hidden md:rounded-t-2xl">
                    <ProfileMediaFields
                        images={values.images}
                        name={values.name || values.slug}
                        isPremium={isPremium}
                        disabled={isSaving}
                        onCoverPicked={(blob, url) => {
                            setPending(current => ({ ...current, cover: blob }))
                            patch({ images: { ...values.images, cover: url } })
                            clearFieldError('images')
                        }}
                        onAvatarPicked={(blob, url) => {
                            // A still replaces a clip in the *form* as well as in the patch —
                            // otherwise the preview keeps the video badge after the person has chosen
                            // a photo.
                            setPending(current => ({
                                ...current,
                                thumb: blob,
                                avatarVideo: undefined,
                            }))
                            patch({ images: { ...values.images, thumb: url, avatarVideo: null } })
                            clearFieldError('images')
                        }}
                        onAvatarVideoPicked={(video, posterUrl) => {
                            setPending(current => ({
                                ...current,
                                avatarVideo: video,
                                thumb: undefined,
                            }))
                            patch({
                                images: {
                                    ...values.images,
                                    thumb: posterUrl,
                                    // A marker object, not the payload that gets saved: the real one is
                                    // built in `resolveImages` once the uploads have URLs. It exists so
                                    // `isProfileDirty` sees a change and the preview shows its badge.
                                    avatarVideo: { pending: true },
                                },
                            })
                            clearFieldError('images')
                        }}
                    />
                </div>

                <div className="flex flex-col gap-4 px-3 pt-6 pb-6 md:px-6">
                    {/*
                     * The moderation verdict on a picture — the one rejection with no input of its
                     * own to sit under. Everything else is a field error or a toast.
                     */}
                    {fieldErrors.images && (
                        <Alert status="error">
                            <AlertIcon status="error" />
                            <AlertContent>
                                <AlertTitle>{fieldErrors.images}</AlertTitle>
                            </AlertContent>
                        </Alert>
                    )}

                    <TextField
                        label={t('profile_name')}
                        placeholder={t('profile_name_placeholder')}
                        value={values.name}
                        maxLength={NAME_MAX * 2}
                        disabled={isSaving}
                        onChange={event => {
                            patch({ name: event.target.value })
                            clearFieldError('name')
                        }}
                        error={fieldErrors.name ?? null}
                        labelData={`${values.name.trim().length}/${NAME_MAX}`}
                        /*
                         * The rules as a live checklist rather than one sentence, because three of
                         * the four are independent and a person fixing a name needs to know which
                         * one is still failing. It only appears once something has been typed — a
                         * checklist of red crosses on an untouched field reads as an accusation.
                         *
                         * The fourth rule (no blocked words) is server-side and is not listed: a
                         * rule with a permanently grey tick would be a lie about what has been
                         * checked. See `NAME_RULES`.
                         */
                        footer={
                            values.name.length > 0 && nameFailures.length > 0 ? (
                                <ul className="flex flex-col gap-1 pt-1">
                                    {NAME_RULES.map(rule => {
                                        const failed = nameFailures.includes(rule)
                                        return (
                                            <li
                                                key={rule}
                                                className={cn(
                                                    'type-caption-meta flex items-center gap-1.5',
                                                    failed
                                                        ? 'text-(--text-error)'
                                                        : 'text-(--text-subtitle)',
                                                )}
                                            >
                                                {/* Two literal tags rather than one computed
                                                    `name`: the sprite build subsets by scanning
                                                    for literal name+weight pairs, so a ternary
                                                    inside the prop is invisible to it. That is
                                                    exactly how `xmark-circle--filled` went missing
                                                    — see `KEEP` in
                                                    `scripts/build-icon-sprite.mjs`. */}
                                                {failed ? (
                                                    <Icon
                                                        name="xmark-circle"
                                                        weight="filled"
                                                        size={16}
                                                        aria-hidden
                                                        className="flex-none"
                                                    />
                                                ) : (
                                                    <Icon
                                                        name="check-circle"
                                                        weight="filled"
                                                        size={16}
                                                        aria-hidden
                                                        className="flex-none"
                                                    />
                                                )}
                                                {t(`profile_name_rule_${rule}`)}
                                            </li>
                                        )
                                    })}
                                </ul>
                            ) : null
                        }
                    />

                    <TextField
                        label={t('profile_username')}
                        placeholder={t('profile_username_placeholder')}
                        prefix="@"
                        value={values.slug}
                        disabled={isSaving}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={event => {
                            patch({ slug: event.target.value.trim() })
                            clearFieldError('slug')
                        }}
                        // The server's rejection outranks the availability check: it is newer, and
                        // it is the one that stopped a save.
                        error={
                            fieldErrors.slug ??
                            (slugCheck.status === 'taken'
                                ? (slugCheck.message ?? t('profile_username_taken'))
                                : null)
                        }
                        labelData={
                            slugCheck.status === 'checking' ? (
                                <span className="text-(--text-subtitle)">
                                    {t('profile_username_checking')}
                                </span>
                            ) : slugCheck.status === 'free' ? (
                                <span className="flex items-center gap-1 text-(--accents-success-active)">
                                    <Icon
                                        name="check-circle"
                                        weight="filled"
                                        size={16}
                                        aria-hidden
                                    />
                                    {t('profile_username_available')}
                                </span>
                            ) : undefined
                        }
                        // Legacy's standing note, and the reason this field gets a live check.
                        hint={t('profile_username_hint')}
                    />

                    <TextAreaField
                        label={t('profile_about')}
                        placeholder={t('profile_about_placeholder')}
                        value={values.description}
                        disabled={isSaving}
                        rows={4}
                        onChange={event => {
                            patch({ description: event.target.value })
                            clearFieldError('description')
                        }}
                        error={
                            fieldErrors.description ??
                            (localErrors.description ? t(localErrors.description) : null)
                        }
                        labelData={`${values.description.length}/${DESCRIPTION_MAX}`}
                    />

                    {/*
                     * Email is shown and **not** editable, exactly as legacy shows it: changing the
                     * address is a credential operation with its own verification flow
                     * (`/settings/password`'s connect-email step), not a text box on a profile
                     * form. Hidden entirely when there is none — a permanently empty disabled field
                     * says nothing.
                     */}
                    {email && (
                        <TextField label={t('profile_email')} value={email} readOnly disabled />
                    )}

                    {/*
                     * The browser's date picker, styled to this form — see `ProfileDateField` for
                     * what was wrong with the bare control and why a calendar of our own would be
                     * an invented component. `max` is the 18-year rule, as a hint the picker can
                     * enforce; `dateOfBirthError` still checks it, because a hint is not a rule.
                     */}
                    <ProfileDateField
                        label={t('profile_dob')}
                        value={values.dateOfBirth}
                        max={maxDateOfBirth()}
                        disabled={isSaving}
                        onChange={event => patch({ dateOfBirth: event.target.value })}
                        error={localErrors.dateOfBirth ? t(localErrors.dateOfBirth) : null}
                        hint={t('profile_dob_hint')}
                    />

                    <ProfileCategoriesField
                        selected={values.categories}
                        disabled={isSaving}
                        onChange={categories => {
                            patch({ categories })
                            clearFieldError('categories')
                        }}
                    />

                    <ProfileSocialLinksField
                        links={values.socialLinks}
                        disabled={isSaving}
                        serverError={fieldErrors.social_links}
                        onChange={socialLinks => {
                            patch({ socialLinks })
                            clearFieldError('social_links')
                        }}
                    />

                    {/* ── my income ─────────────────────────────────────────────────────── */}
                    <div className="flex flex-col gap-1.5">
                        <span className="type-dense-strong text-(--text-body)">
                            {t('profile_income')}
                        </span>
                        <div className="flex items-center gap-3 rounded-lg border border-(--separator-default) p-3">
                            <span className="type-dense-default min-w-0 flex-auto text-(--text-title)">
                                {t('profile_income_show')}
                            </span>
                            <Toggle
                                checked={values.showIncome}
                                disabled={isSaving}
                                onCheckedChange={showIncome => patch({ showIncome })}
                                aria-label={t('profile_income_show')}
                            />
                        </div>
                        {/*
                         * Said plainly, because this switch publishes a number to strangers. The
                         * stats strip renders `income_usd` for **anyone** when `show_income` is
                         * set — that is the creator's own opt-in, not an owner-only view (see
                         * `channel-stats.tsx`), and someone flipping it without knowing that is the
                         * mistake this line exists to prevent.
                         */}
                        <p className="type-caption-meta text-(--text-subtitle)">
                            {t('profile_income_hint')}
                        </p>
                    </div>
                </div>
                {/*
                 * ## The desktop action bar — `md` and up only, and **part of the panel**
                 *
                 * Its twin is the Save in the bar (`ProfileTopBar`), which is `md:hidden`; exactly
                 * one of the two is ever rendered, and because both are toggled with `display`
                 * rather than opacity, exactly one is in the accessibility tree. See the note over
                 * there for why the placement changes with the width at all.
                 *
                 * It sits **inside** the panel and shares its fill. It used to be a card of its
                 * own — same surface, own radius, own shadow, floating under the panel — and two
                 * white boxes a few pixels apart read as a seam rather than as one screen. Now the
                 * only thing marking it is the hairline every other divider on this form uses, and
                 * the panel's bottom corners belong to it (`md:rounded-b-2xl`) because it is the
                 * last thing in the box.
                 *
                 * That is also why `PROFILE_PANEL` lost its `overflow-hidden` — see there.
                 *
                 * **Cancel comes back with the footer**, and only here. On a phone the bar's back
                 * button is *the* way out and a second one would be noise; on a desktop window that
                 * button is a small disc in the far corner, so a form that ends without a way to
                 * abandon it reads as one you are committed to. It is `router.back()` — the same
                 * thing the bar's own back does, not a separate discard path.
                 *
                 * `sticky bottom-0`: the form is taller than a window, so the pair would otherwise
                 * sit below the fold until the very end. Sticky keeps its place in flow — at the
                 * bottom of the scroll it settles into its own space rather than covering the last
                 * field.
                 *
                 * Right-aligned and auto-width, not two halves of the column: halves are the phone
                 * shape, and this bar only exists on desktop.
                 */}
                <div
                    className={cn(
                        'sticky bottom-0 z-10 mt-auto hidden items-center justify-end gap-3 md:flex',
                        'border-(--separator-default) border-t bg-(--background-surface) p-3',
                        'md:rounded-b-2xl',
                    )}
                >
                    <Button
                        type="button"
                        variant="secondary"
                        size="large"
                        className="min-w-[120px]"
                        disabled={isSaving}
                        onClick={() => router.back()}
                    >
                        {t('common_cancel')}
                    </Button>
                    {/*
                     * `accent`, not `primary`. `--button-primary-bg` is the Zinc ramp's top step —
                     * black in Light, white in Dark — while `--button-accent-bg` is `--primary-500`
                     * (#501bc0), the same one step of the brand ramp the logo's tile is filled with
                     * (`shared/ui/logo.tsx`). Save is the brand action on this screen, and the text
                     * Save in the bar below md already paints from that token; a black button here
                     * made the same action two different colours at two widths.
                     */}
                    <Button
                        type="submit"
                        variant="accent"
                        size="large"
                        className="min-w-[120px]"
                        disabled={!canSave}
                    >
                        {isSaving ? t('profile_saving') : t('common_save')}
                    </Button>
                </div>
            </div>
        </form>,
        { label: isSaving ? t('profile_saving') : t('common_save'), canSave },
    )
}

/**
 * The form's shape while the channel is being read.
 *
 * ## It has to be the *loaded* screen with the ink removed
 *
 * This one was not. It drew a full-bleed cover, an 80px circle and four grey slabs on the page
 * background — while what arrives is a **panel**: a surface card with rounded top corners, a 120px
 * avatar from md, labelled rows, and an action bar along its bottom edge. So the wait ended with a
 * white card appearing from nowhere and every row moving. `docs/DEFINITION_OF_DONE.md` §1 asks for
 * a skeleton matching the final layout's shape; this is that, structure for structure.
 *
 * Three specifics worth keeping:
 *
 * - **The avatar is sized by classes, not by `w`/`h`.** `Skeleton` writes those props to inline
 *   styles, and an inline `width: 80px` beats `md:size-[120px]` — so the old skeleton's circle
 *   stayed 80 at every width while the real one grows to 120. Hence the wrapper: the box carries
 *   the responsive size and the bar fills it.
 * - **A row is a label bar, a 48 control and a reserved message line**, not one 72px slab. The
 *   slab reads as a giant input and lands nowhere near where the real label sits.
 * - **The action bar is reserved at md**, because it is 72px of the panel's bottom edge that would
 *   otherwise appear on resolve.
 *
 * No hooks, so it still renders on the server.
 */
export function EditProfileSkeleton() {
    return (
        <div className={cn(PROFILE_PANEL, 'flex flex-col')} aria-busy="true">
            {/* Same clip as the loaded media block — the cover's square corners against the
                panel's rounded ones. */}
            <div className="overflow-hidden md:rounded-t-2xl">
                <Skeleton h="auto" className="aspect-[402/140] w-full rounded-none" />
                <div className="flex flex-col gap-2 px-3 md:px-6">
                    <div className="-mt-12 flex items-end md:-mt-[76px]">
                        <div className="size-20 md:size-[120px]">
                            <Skeleton circle className="size-full" />
                        </div>
                    </div>
                    {/* The format/size note under the avatar. */}
                    <div className="flex h-4 items-center">
                        <Skeleton w="70%" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 px-3 pt-6 pb-6 md:px-6">
                {[0, 1, 2, 3].map(index => (
                    <div key={index} className="flex flex-col gap-1.5">
                        {/* `type-dense-strong` is 14/150%, so its line box is 21 — reserve the row
                            at that height and put the 12px bar inside it, or the column collapses
                            and everything below shifts on load. */}
                        <div className="flex h-[21px] items-center">
                            <Skeleton w={72} />
                        </div>
                        <Skeleton h={48} delay={index * 160} className="rounded-lg" />
                        {/* `FieldShell`'s message line, which is reserved whether or not it has
                            anything to say. */}
                        <div className="h-4" />
                    </div>
                ))}
            </div>

            {/* The desktop action bar's own space. `md:flex` for the same reason the real one has
                it — below md the action lives in the top bar, where nothing needs reserving. */}
            <div className="mt-auto hidden items-center justify-end gap-3 border-(--separator-default) border-t p-3 md:flex">
                <Skeleton w={120} h={48} className="rounded-lg" />
                <Skeleton w={120} h={48} className="rounded-lg" />
            </div>
        </div>
    )
}
