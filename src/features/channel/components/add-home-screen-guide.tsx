'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { Trans } from 'react-i18next'
import { ADD_HOME_SCREEN_ART } from '../lib/illustrations'

/**
 * **"Add {space} to your Home Screen"** — the instruction screen behind
 * `/@ada?startapp&addToHomeScreen`, ported from legacy's `components/layouts/addHomeScreen`.
 *
 * ## What it is for, since nothing on the site links to it
 *
 * iOS has no install prompt. Chrome offers one off the manifest the space page declares, but on
 * iOS the only route onto a home screen is Share → *Add to Home Screen*, which nothing can trigger
 * and nothing can advertise — so this screen is the advertisement: a picture of where the icon
 * lands and the two taps that put it there. That is why it is two sentences and a mock-up rather
 * than a page with an action.
 *
 * The URL is legacy's, unchanged, so links already in the wild keep working (`proxy.ts` rewrites
 * that pair of markers onto this route). What it is **not** any more is where an installed space
 * launches — see `channelStartUrl` in `../lib/channel-manifest.ts` for that, and for the evidence
 * that legacy did not intend it either.
 *
 * ## The one behaviour deliberately not ported
 *
 * Legacy runs a redirect from here on mount, on `focus` and on `visibilitychange`: if the page is
 * already running as an installed app (`display-mode: standalone`) it sends the reader to
 * `${process.env.ADD_TO_HOME_SCREEN}/{slug}?startapp&addToHomeScreen`. That variable is declared in
 * legacy's `next.config.mjs` `env` block and set in **none** of its three env files, so the value
 * inlined into the bundle is `undefined` and the destination reads `undefined/@ada?…`. Whatever
 * host it was meant to be — the shape suggests a deep link that opens the native app — is
 * deployment configuration this repository cannot name, and a client component whose only job is a
 * navigation nobody can verify is worse than the honest absence. Fixing it needs the value, at
 * which point this becomes a `useEffect` and a note in `.env.local.example`.
 *
 * Two smaller pieces of legacy go with it, because both only existed to serve that redirect and the
 * client-side fetch feeding it: the `Snackbar` error (a toast, then `router.push('/')`) and the
 * avatar `Skeleton`. This screen is server-rendered from a channel the route already has, so there
 * is no in-flight state to skeleton and no fetch to fail — an unavailable space never reaches this
 * component (`app/add-home-screen/[slug]/page.tsx` sends it to the space instead).
 *
 * ## Design
 *
 * There is no Figma page for this screen, so the geometry is legacy's: a centred column, the phone
 * mock-up at 200/250/294 wide by breakpoint, the title at 20 below `sm` and 24 above, and the two
 * steps at 14/500. What is *not* legacy's is every colour — `#FFFFFF`, `#000`, `#141414` and
 * `#0061FF` are hard-coded there, and the last of those is legacy's own brand blue (its
 * `_document.js` sets `theme-color: #0061FF`), not a reference to iOS's share glyph. So the accent
 * maps to `--text-brand`, and the screen follows the theme like every other.
 */
export function AddHomeScreenGuide({
    name,
    avatarUrl,
}: {
    name: string
    avatarUrl: string | null
}) {
    const { t } = useTranslation()

    return (
        <section
            data-testid="channel-add-home-screen"
            className="flex min-h-[var(--window-height)] flex-col items-center justify-center gap-6 px-4 py-10"
        >
            {/*
             * ## The tile is `--white` in both themes, and that is the picture's fault
             *
             * The mock-up is an opaque JPEG of a home screen: near-white slots on a white ground,
             * no alpha to key out (see `ADD_HOME_SCREEN_ART`). On a dark page it would be a white
             * rectangle with a hole in it. Drawn on its own light tile it reads as what it is — a
             * photograph of a phone — and the seam disappears, because the tile is the same white
             * the picture's own ground is. Recolouring the art is not an option: the build script
             * changes bytes, not pictures.
             *
             * `overflow-hidden` is what clips the avatar to the rounded corner; there is nothing
             * scrollable inside, so the note in `docs/DESIGN_SYSTEM.md` about `overflow-clip` and
             * sticky positioning does not apply here.
             */}
            <div className="relative w-[200px] overflow-hidden rounded-(--radius-2xl) bg-(--white) sm:w-[250px] md:w-[294px]">
                <Image
                    src={ADD_HOME_SCREEN_ART.phone.src}
                    /* Decorative: the title and the steps under it say all of it in words. */
                    alt=""
                    width={ADD_HOME_SCREEN_ART.phone.width}
                    height={ADD_HOME_SCREEN_ART.phone.height}
                    className="h-auto w-full"
                    /*
                     * The only picture on the screen, so it *is* the LCP — `loading="eager"` for
                     * the reason `ChannelEmptyState` spells out, and `priority` on top of it
                     * because here the claim about the document is true: there is nothing else to
                     * compete with.
                     */
                    priority
                />
                {/*
                 * ## The avatar sits in the mock-up's empty slot, in percentages
                 *
                 * Legacy hard-codes the overlay three times — 100px at 73 from the bottom, 85 at
                 * 62, 70 at 50 — one per breakpoint. All three are the same fractions of their box
                 * (34% of the width, 22.6% of the height from the bottom, radius 30% of the side),
                 * so one rule reproduces all of them and any width between them, which is what a
                 * fluid `w-[…]` at three breakpoints actually needs.
                 *
                 * `inset-x-0 mx-auto` rather than `start-1/2 -translate-x-1/2`: it is legacy's own
                 * centring and it means the same thing in both writing directions, where a
                 * `start`-anchored translate does not.
                 *
                 * Nothing is drawn when a space has no avatar. The mock-up's slot is already
                 * empty — that is the hole the picture leaves — so an absent picture looks like an
                 * unfilled slot rather than a broken one.
                 */}
                <div className="absolute inset-x-0 bottom-[22.6%] mx-auto aspect-square w-[34%] overflow-hidden rounded-[30%]">
                    {avatarUrl && (
                        <Image
                            src={avatarUrl}
                            alt=""
                            fill
                            /* The widest this slot is ever drawn: 34% of 294. */
                            sizes="100px"
                            /*
                             * A real avatar is not square — one measures 1015×338 — and legacy
                             * renders it `layout='responsive'`, which fits the width and leaves a
                             * third of the slot empty. `object-cover` crops to the slot instead,
                             * which is what an app icon is.
                             */
                            className="object-cover"
                        />
                    )}
                </div>
            </div>

            {/*
             * **One size, and it is legacy's phone value** — 20, where legacy steps to 24 above its
             * `sm`. The same call `mcn-user-invitation-view.tsx` makes and for the same reason: the
             * `.type-*` utilities are plain rules in `globals.css`'s `@layer components`, so
             * Tailwind generates no `sm:`/`md:` variant of them and the responsive port would be a
             * dead class, while a hand-written `font-size` is what CLAUDE.md forbids. Measured here
             * too — with `sm:type-title-t1-semibold` in the markup the title still rendered 20px at
             * 1280, and the emitted stylesheet carries no `sm\:` form of it.
             *
             * 20 rather than 24 because this screen only makes sense on a phone: the steps under it
             * are about Safari's share sheet.
             */}
            <h1 className="type-title-t2-semibold text-center text-(--text-title)">
                {t('channel_add_home_screen_title', { name })}
            </h1>

            {/*
             * `list-none` with the numbers inside the strings, which is legacy's arrangement and
             * the one that survives translation: a CSS marker is always a Western digit, and the
             * step's number is part of a sentence a translator has to be able to move.
             */}
            <ol className="flex list-none flex-col items-start gap-2.5">
                {[
                    {
                        step: 'share',
                        /**
                         * Legacy draws the iOS share glyph as an inline `<svg>`; `upload-bracket`
                         * is the same drawing in the DS sprite (an arrow leaving an open tray),
                         * which is what keeps it in step with the icon set and off a pasted path.
                         */
                        i18nKey: 'channel_add_home_screen_step_share',
                        components: [
                            <Icon
                                key="share"
                                name="upload-bracket"
                                size={16}
                                /*
                                 * **Named for a screen reader, unlike the glyph in step 2.** This
                                 * one is the *only* identification of the button being described —
                                 * without a label the step reads "1. Tap in the bottom bar", which
                                 * is legacy's bug (an inline `<svg>` with no title). Step 2's plus
                                 * is followed by the menu item's name in words, so labelling it
                                 * would announce the same thing twice.
                                 */
                                title={t('channel_add_home_screen_share_icon')}
                                className="shrink-0 text-(--text-brand)"
                            />,
                        ],
                    },
                    {
                        step: 'add',
                        i18nKey: 'channel_add_home_screen_step_add',
                        components: [
                            <Icon
                                key="add"
                                name="plus-square"
                                size={16}
                                className="shrink-0 text-(--text-brand)"
                            />,
                            // The menu item's own label, coloured the way legacy colours it so the
                            // reader can match the words to what iOS shows them.
                            <span key="label" className="text-(--text-brand)" />,
                        ],
                    },
                ].map(({ step, i18nKey, components }) => (
                    <li
                        key={step}
                        /*
                         * One id for both rows, with the step's identity in a companion attribute
                         * — `docs/TEST_IDS.md`'s rule, and the reason is exactly this shape of
                         * list: an index in the id would renumber if a step were ever inserted.
                         */
                        data-testid="channel-add-home-screen-item"
                        data-step={step}
                        className="type-dense-emphasis flex items-center gap-[5px] text-(--text-title)"
                    >
                        {/*
                         * `Trans`, not two keys around an icon. The glyph sits **inside** the
                         * sentence, and where in the sentence is the translator's decision — Arabic
                         * puts it on the other side of the words either way. Each locale wraps the
                         * slot in `<0></0>` (and `<1>` for the menu item's name); nothing here
                         * assumes an order.
                         */}
                        <Trans i18nKey={i18nKey} components={components} />
                    </li>
                ))}
            </ol>
        </section>
    )
}
