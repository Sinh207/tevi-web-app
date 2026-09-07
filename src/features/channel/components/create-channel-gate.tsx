'use client'

import { useAuth } from '@features/auth'
import { DateField } from '@shared/components/date-field'
import { TextField } from '@shared/components/field'
import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { toDateValue } from '@shared/lib/date-value'
import { POP, RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import Image from 'next/image'
import { useEffect, useId } from 'react'
import { useCreateChannel } from '../hooks/use-create-channel'
import { displayUrl } from '../lib/channel-slug'
import { AVATAR_ASPECT } from '../lib/profile-form'
import { ImageCropDialog } from './edit-profile/image-crop-dialog'

/**
 * Onboarding: the screen that replaces the entire app for an account with no space.
 *
 * ## It was a prompt. Legacy is a form.
 *
 * The first version of this file was a logo, a heading, a sentence and two buttons — an invitation
 * to go and create a space somewhere else. There is no somewhere else: legacy's
 * `components/createMyChannel/` **is** the creation flow, and it collects four things before the app
 * unlocks. Reading the file rather than inferring from its name is what closed that gap, and it is
 * the second time in this feature that guessing produced the wrong *kind* of screen.
 *
 * ## Two columns, and the left one is decoration that does work
 *
 * Above `md`, legacy splits 7/5 with a banner on the left and a **sticky note** pinned over it —
 * `#FFC759`, rotated `-16deg`, with a diamond nub drawn by `::before` — showing `{origin}/@{slug}`
 * live as the link field is typed. It is the only place the user sees what their address will
 * actually look like, so it is not ornament and it is ported. Below `md` the whole column is
 * `display: none` and the form goes full-bleed, losing its frame with it.
 *
 * The frame itself is legacy's one piece of neo-brutalism: `1px solid #191A23` with
 * `box-shadow: 0 5px 0 0 #191A23` — a hard offset, no blur — at `border-radius: 45px`. They stay
 * **literals**, not `--text-title`: that token inverts, and a card that is pinned to a light fill
 * must keep its dark edge. This docblock used to claim the opposite and it was never true of the
 * code below it.
 *
 * ## The screen is pinned to Light, and one class is what pins it
 *
 * Writing literals only holds the *literals* still. Every field, button and popover here comes from
 * `shared/`, reads the `--*` ramp, and inverted under `.dark` **on top of the light card**: black
 * inputs, a black avatar disc, and three strings (the Link hint, the suggestions heading, Sign out)
 * that resolved to near-white on `#F3F3F3` and simply vanished. `theme-light` on `<main>`
 * (`globals.css`) re-declares the token set back to its Light values for this subtree, so the
 * shared components agree with the art instead of fighting it. Read that block before adding a
 * token to `.dark`.
 *
 * ## The fields are the app's, not this screen's
 *
 * `TextField` and `DateField` both come from `shared/components/`. Date of birth used to be a native
 * `<input type="date">` — the DS ships no date picker and the OS one is good on a phone — and is now
 * the app's own calendar in a popover, so this form has no control that is visibly from another
 * application. Legacy uses MUI's `DatePicker`; the package here is `react-day-picker`, dressed in our
 * tokens and loaded only when a picker opens.
 */
export function CreateChannelGate() {
    const { t } = useTranslation()
    const { signOut, isSigningOut } = useAuth()

    /*
     * The same pin, one level up — because **portals escape a subtree class**.
     *
     * `theme-light` on `<main>` (below) is what makes the screen's own tree resolve Light, and it
     * has to stay there: it is in the first paint, so nothing flashes, and it carries the
     * `color-scheme` that next-themes writes as an *inline* style on `<html>` and a class there
     * could not beat. But base-ui renders `Popover` and `Dialog` into `<body>`, outside it — so the
     * DOB calendar came out as a dark slab in the middle of an all-light screen, and the avatar
     * cropper with it.
     *
     * `<html>` is the one ancestor a portal shares with the page. `.theme-light` and `.dark` are
     * both one class, so specificity ties and source order decides — `.theme-light` is declared
     * after the dark blocks in `globals.css`, which is why it wins there and why moving it above
     * them would silently undo this.
     *
     * Pinning the document is the honest scope, not a workaround: this screen *is* the app while it
     * is mounted. Removing it on unmount is what keeps that true — the next thing rendered is the
     * real shell, which is themed.
     */
    useEffect(() => {
        document.documentElement.classList.add('theme-light')
        return () => document.documentElement.classList.remove('theme-light')
    }, [])

    const dobId = useId()
    const avatarId = useId()
    const form = useCreateChannel({
        fallbackError: t('channel_onboarding_generic_error'),
        messages: {
            minimumAge: t('channel_onboarding_min_age'),
            avatarTooLarge: t('channel_onboarding_avatar_too_large'),
            avatarWrongType: t('channel_onboarding_avatar_wrong_type'),
        },
    })

    /*
     * `NEXT_PUBLIC_BASE_URL`, **not** `window.location.origin`.
     *
     * The origin is `''` on the server and the real URL on the client, so rendering it produced a
     * hydration mismatch — React threw and discarded the tree on first paint. That is the same class
     * of bug as the timezone one in `formatJoinedDate`, found the same way (a browser, not a
     * reading), and it was introduced here two hours after fixing that one.
     *
     * The env value is inlined at build time, so both sides agree. It is also the *better* string:
     * a creator setting up their space wants to see `tevi.com/@ada`, not `localhost:3000/@ada`.
     */
    const origin = displayUrl(env.NEXT_PUBLIC_BASE_URL)
    const previewSlug = form.slug.value || t('channel_onboarding_link_placeholder')

    return (
        /*
         * `#FAF8FF` under a full-bleed background image, both legacy's. Literals rather than tokens
         * because this screen is **not themed**: it is the one surface that exists before an account
         * has a space, it ships its own art, and the art is drawn against that lilac. A dark-mode
         * `--background` behind a light illustration would be worse than not following the theme.
         *
         * `theme-light` is what makes "not themed" true of the whole subtree rather than only of
         * the literals — see the block of that name in `globals.css`. It carries `color-scheme`
         * too, so the file input and the scrollbar of the field stack come out light as well.
         *
         * `py-10` is legacy's `theme.spacing(5)`.
         */
        <main
            className="theme-light flex min-h-[var(--window-height)] w-full items-stretch justify-center bg-[#FAF8FF] md:h-[var(--window-height)] md:overflow-hidden bg-cover bg-center bg-no-repeat px-0 py-10 md:px-10"
            style={{ backgroundImage: 'url(/illustrations/create-space-bg.webp)' }}
        >
            <div className="mx-auto flex w-full max-w-[1200px] items-stretch gap-6">
                {/* Left: the banner and its note. Hidden below `md`, exactly as legacy hides it. */}
                <div className={cn('relative hidden flex-1 md:block lg:flex-[7]', RISE)}>
                    {/*
                     * Legacy stretches this to the column with `width: 100%; height: 100%` on an
                     * `Image` given `width={0} height={0}` — so the aspect ratio is *not* preserved,
                     * deliberately. `object-contain` is the one deviation: the art is a character in
                     * a bubble, and stretching a face is the kind of thing nobody notices in review
                     * and everybody notices on the page.
                     */}
                    <Image
                        src="/illustrations/create-space-banner.webp"
                        alt=""
                        fill
                        priority
                        sizes="(max-width: 900px) 0px, 58vw"
                        className="object-contain"
                    />
                    {/*
                     * The sticky note. `rotate-[-16deg]` and the 215px width are legacy's; the nub is
                     * a rotated square pinned to the leading edge, which is what its `::before` is.
                     * `#FFC759` has no token — it is a one-off prop colour, not part of the ramp — so
                     * it stays a literal, and the text on it is pinned dark for the same reason the
                     * QR plate is pinned white: the paper does not change colour with the theme.
                     */}
                    <div className="absolute top-[38%] right-[16%] w-[215px] rotate-[-16deg] rounded-[3px] bg-[#FFC759] px-3 py-1.5 shadow-[0_4px_4px_0_#00000040]">
                        <span className="absolute top-2.5 -start-1.5 inline-block size-3 rotate-45 bg-[#FFC759]" />
                        <p className="type-dense-emphasis truncate text-[#666666]">
                            {origin}/@
                            <span className="text-[#061C3D]">{previewSlug}</span>
                        </p>
                    </div>
                </div>

                {/* Right: the form. Frame above `md`, bare below it. */}
                <div
                    className={cn(
                        /*
                         * **Two scroll models, split at `md`** — and the split is not a compromise,
                         * it is what each width is actually good at.
                         *
                         * From `md` up this is legacy's shape: the page is locked to the viewport
                         * and only the field block scrolls, so the title and the submit button
                         * never leave the screen. There is room for that at a desktop height.
                         *
                         * Below `md` the card loses its frame (legacy drops the border, fill and
                         * shadow there) and the content is simply the page — so the **page**
                         * scrolls. An inner scroller on a phone is the worse of the two: it fights
                         * the browser's own overscroll, hides its own overflow with no affordance,
                         * and on a screen where the form is nearly as tall as the viewport it buys
                         * nothing. Reachability beats a pinned button.
                         */
                        'flex w-full flex-col items-center gap-5 p-6 md:h-full md:flex-1 md:overflow-hidden lg:flex-[5]',
                        /*
                         * The two columns arrive together, the form a beat behind the art —
                         * `riseDelay(1)` is the app's 60ms step. Any longer and the card reads as
                         * loading rather than as appearing.
                         */
                        RISE,
                        // `#F3F3F3` and `#191A23` are legacy's, kept as literals for the same
                        // reason the page is: this screen does not follow the theme.
                        'md:rounded-[45px] md:border md:border-[#191A23] md:bg-[#F3F3F3] md:p-10',
                        // A hard offset, not a blur — legacy's `0 5px 0 0`.
                        'md:shadow-[0_5px_0_0_#191A23]',
                    )}
                    style={riseDelay(1)}
                >
                    <Logo size={48} />
                    {/*
                     * `font-brand` uppercase at 32 with legacy's three-layer shadow: two white
                     * offsets carving the glyph out of its background, then a hard black drop.
                     */}
                    {/*
                     * Legacy's three-layer shadow, verbatim: two 1px white offsets that carve the
                     * glyph out of the panel, then a hard 3px black drop. It is what makes the
                     * Chella weight read as a sticker rather than as a heading, and dropping it —
                     * which the first version did — is most of why the screen looked wrong.
                     */}
                    {/*
                     * `leading-none`, and it is why the header felt loose rather than the gap.
                     *
                     * The container's `gap-5` is legacy's 20 exactly — measured. What was not
                     * legacy's is the line box: this app's `--line-height-default` is 1.5, so 32px
                     * type sat in a **48px** box and contributed 8px of dead space above the caps
                     * and 8 below the descenders. The eye reads 28px of gap where the CSS says 20.
                     * Legacy's MUI `h1` is 1.167 and never had it.
                     *
                     * Trimming the leading rather than shrinking the gap keeps the number that
                     * matches legacy and removes the space that does not.
                     */}
                    <h1
                        className="text-center font-brand text-[32px] leading-none text-black uppercase"
                        style={{
                            textShadow: '1px 1px 0px #fff, -1px -1px 0px #fff, 3px 3px 0px #000',
                        }}
                    >
                        {t('channel_onboarding_title')}
                    </h1>
                    {/* 18/400 — legacy's, one step above the app's `type-body-default`. */}
                    <p className="text-center text-[18px] text-black leading-normal">
                        {t('channel_onboarding_body')}
                    </p>

                    {/*
                     * The only scroller. Legacy puts `overflowY: auto` on exactly this stack so a
                     * long suggestion list, a soft keyboard or a short laptop never pushes the
                     * submit button off the bottom — which is the state the form is least useful in.
                     */}
                    {/*
                     * **No `items-center` here.** A column flex that centres its children sizes
                     * them to their content, so every field came out as wide as its own text and
                     * the date field — a button with an intrinsic width — came out narrowest of
                     * all. Legacy hits the same wall and papers over it with `width: '100%'` on each
                     * field; letting the default `stretch` do it is the same result without three
                     * copies of the same override, and it cannot be forgotten on the fourth field.
                     *
                     * The avatar is the one child that *should* be content-width, so it centres
                     * itself.
                     */}
                    {/*
                     * `min-h-0` on the message rows, and the gap does the spacing instead.
                     *
                     * `FieldShell` reserves `min-h-4` under every input so an error appearing cannot
                     * shove the form down — the right default, and on this screen an expensive one:
                     * two of the three fields carry no message, so it is 32px of permanent air on a
                     * form that already scrolls. Collapsing it and paying the gap explicitly puts
                     * the spacing where it can be read (`gap-2.5`) instead of leaving it as a
                     * side-effect of a reserve.
                     *
                     * The trade is real and worth naming: an error under Space name or Date of
                     * birth now nudges what follows. The Link field is unaffected either way — it
                     * always renders a hint, so its row was never empty.
                     */}
                    <div className="flex w-full flex-col gap-1.5 px-1 md:flex-1 md:overflow-y-auto [&_[id$='-message']]:min-h-0">
                        {/* Avatar: an 80px dashed ring that becomes the picked image. */}
                        {/*
                         * `mb-4` stands in for the message row a field has and the avatar does not.
                         *
                         * `FieldShell` reserves 16px under every input whether or not it has a
                         * message — the right call, since an error appearing must not shove the form
                         * down. But it means the container's own gap is *added* to that: at
                         * `gap-6` the eye saw 24 between the avatar and the first label and 40
                         * between every pair of fields. Legacy's rhythm is a flat 24.
                         *
                         * A field's own bottom furniture is **22px** — 6 of internal gap under the
                         * input plus the 16 reserved slot — so the container contributes the last 2
                         * and the avatar carries 22 of its own. All three gaps land on legacy's 24.
                         *
                         * A 2px flex gap looks like a typo, which is exactly why it is written down:
                         * the spacing here is mostly *inside* the fields, and the container is only
                         * topping it up.
                         */}
                        <div className="mb-1.5 flex flex-col items-center gap-2 self-center">
                            <input
                                data-testid="channel-create-avatar-file"
                                id={avatarId}
                                type="file"
                                accept="image/jpeg,image/png"
                                hidden
                                onChange={event => form.pickAvatar(event.target.files?.[0] ?? null)}
                            />
                            {/*
                             * `POP` on the picked photo, not `RISE`. The distinction is the one
                             * `shared/lib/motion` draws: a rise is "here is content", a pop is
                             * "that just happened" — and cropping is a thing the user did a
                             * moment ago. The box is a fixed 80px either way, so nothing reflows.
                             */}
                            <label
                                key={form.avatar?.preview ?? 'empty'}
                                htmlFor={avatarId}
                                className={cn(
                                    'flex size-20 cursor-pointer items-center justify-center rounded-full border border-(--primary-600) border-dashed bg-(--background-segment) bg-cover bg-center text-(--primary-600)',
                                    form.avatar && POP,
                                )}
                                style={
                                    form.avatar
                                        ? { backgroundImage: `url(${form.avatar.preview})` }
                                        : undefined
                                }
                            >
                                {!form.avatar && <Icon name="camera" size={24} />}
                                <span className="sr-only">{t('channel_onboarding_avatar')}</span>
                            </label>
                            {form.avatarError && (
                                <p className="type-caption-meta text-center text-(--text-error)">
                                    {form.avatarError}
                                </p>
                            )}
                        </div>

                        <TextField
                            data-testid="channel-create-name"
                            label={t('channel_onboarding_name')}
                            value={form.name.value}
                            onChange={event => form.setName(event.target.value)}
                            error={form.name.error}
                            autoComplete="off"
                        />

                        {/*
                         * `DateField` — the app's own calendar in a popover, shared with the profile
                         * form and with the dashboard's range picker. See that component for what
                         * replacing `<input type="date">` costs and buys.
                         *
                         * I wrote the second one before finding the first: same idea — hide
                         * `::-webkit-calendar-picker-indicator`, overlay the DS `calendar` glyph,
                         * call `showPicker()` — and the existing one already carries what a second
                         * attempt does not know, including the measured trap that stretching the
                         * invisible native indicator across the field swallows every click and
                         * leaves the input unfocusable, and the note that Firefox has no way to hide
                         * its own indicator.
                         *
                         * `max` is today: a birth date in the future is the one rule worth checking
                         * without a round trip.
                         */}
                        <DateField
                            testId="channel-create-dob"
                            id={dobId}
                            label={t('channel_onboarding_dob')}
                            value={form.dob}
                            max={toDateValue(new Date())}
                            error={form.dobError}
                            onValueChange={form.setDob}
                        />

                        <TextField
                            data-testid="channel-create-username"
                            label={t('channel_onboarding_link')}
                            value={form.slug.value}
                            onChange={event => form.setSlug(event.target.value)}
                            error={form.slug.error}
                            prefix="@"
                            hint={`${origin}/@${form.slug.value}`}
                            autoComplete="off"
                        />

                        {form.suggestions.length > 0 && (
                            /*
                             * A wrapping row of chips, where legacy stacks one per line.
                             *
                             * The deviation is forced by height, and the height is forced by two
                             * things legacy does not have: a reserved message row under every field
                             * (48px across three) and the Sign out button (~50px), which is the only
                             * exit from a screen that replaces the whole app.
                             *
                             * Measured at 900px with five suggestions, the stacked list put **zero**
                             * of them inside the scroll viewport and clipped its own heading on
                             * mobile — a mechanism that works and cannot be seen. Chips are two rows
                             * instead of five, and a slug is a short token, which is what a chip is
                             * for.
                             */
                            <div className="flex w-full flex-col items-start gap-2">
                                <p className="type-dense-strong text-(--text-title)">
                                    {t('channel_onboarding_suggestions')}
                                </p>
                                {/*
                                 * The one block on this screen that genuinely *arrives*: the chips
                                 * land whenever `suggest-slug` answers, which is after the form is
                                 * already on screen. Without an entrance they blink into existence
                                 * and push the layout; staggered at the app's 60ms step they read
                                 * as a list filling in.
                                 */}
                                <ul className="flex min-w-0 flex-wrap gap-2">
                                    {form.suggestions.map((suggestion, index) => (
                                        <li
                                            key={suggestion}
                                            className={RISE}
                                            style={riseDelay(index)}
                                        >
                                            <button
                                                data-testid="channel-create-suggestion"
                                                type="button"
                                                onClick={() => form.applySuggestion(suggestion)}
                                                className="type-dense-emphasis flex h-8 cursor-pointer items-center gap-1.5 rounded-(--radius-fill) border border-[#191A23]/15 bg-white/60 ps-2 pe-3 text-[#141414] transition-colors hover:bg-white"
                                            >
                                                {/* Legacy's green double-check — "this one is free". */}
                                                <Icon
                                                    name="check-all"
                                                    size={16}
                                                    className="flex-none text-[#00C443]"
                                                />
                                                {suggestion}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="flex w-full flex-col gap-3 pt-4 md:flex-none">
                        {/*
                         * `accent`, not `primary`. `--button-primary-bg` is near-black; legacy's
                         * submit is `#501BC0`, and `--button-accent-bg` resolves to exactly that —
                         * so the purple is a DS variant rather than a literal smuggled in.
                         */}
                        <Button
                            data-testid="channel-create-submit"
                            variant="accent"
                            size="large"
                            fullWidth
                            disabled={!form.ready || form.isCreating}
                            onClick={form.submit}
                        >
                            {t('channel_onboarding_next')}
                        </Button>
                        {/*
                         * The only way out. This screen replaces the whole app, so without it an
                         * account that does not want a space is trapped on it.
                         */}
                        {/*
                         * `large`, matching the button above it. At `medium` it is 36 against 48,
                         * which is invisible while the ghost variant paints nothing — and then the
                         * hover fill appears at a different height from the button it sits under,
                         * so the mismatch only shows at the moment the user is pointing at it.
                         */}
                        <Button
                            data-testid="channel-create-sign-out"
                            variant="ghost"
                            size="large"
                            fullWidth
                            disabled={isSigningOut}
                            onClick={() => signOut()}
                        >
                            {t('channel_onboarding_sign_out')}
                        </Button>
                    </div>
                </div>
            </div>
            {/*
             * The same cropper `edit-profile` uses — round, 1:1, and driven by the same hook state.
             * Two avatar pickers in one feature is exactly the drift this codebase keeps paying for,
             * so there is one dialog and one set of rules.
             */}
            <ImageCropDialog
                open={Boolean(form.cropping)}
                onOpenChange={open => {
                    if (!open) form.closeCropper()
                }}
                src={form.cropping?.src ?? null}
                type={form.cropping?.type ?? 'image/jpeg'}
                aspect={AVATAR_ASPECT}
                shape="round"
                title={t('profile_crop_avatar')}
                onCropped={blob => {
                    form.applyCrop(blob)
                    form.closeCropper()
                }}
            />
        </main>
    )
}
