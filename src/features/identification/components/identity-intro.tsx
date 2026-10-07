'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Card } from '@shared/ui/card'
import { Checkbox } from '@shared/ui/checkbox'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import { useId, useState } from 'react'
import { IDENTIFICATION_PANEL } from '../lib/container'
import { IDENTITY_ART } from '../lib/illustrations'
import { RISE, riseDelay } from '../lib/motion'

/** Legacy's three-item checklist, in its order. */
const REQUIREMENTS = [
    'identification_requirement_document',
    'identification_requirement_camera',
    'identification_requirement_selfie',
] as const

/** Sumsub's own site, linked out of the "powered by" line as legacy links it. */
const SUMSUB_URL = 'https://sumsub.com/'

/**
 * Turn the "Powered by Sumsub…" string into text with one link in it.
 *
 * Legacy does this with `dangerouslySetInnerHTML` and a `String.replace` that injects an
 * `<a>`; every locale's copy contains the literal word "Sumsub", so the same split can be
 * done on the text itself and rendered as React nodes. That matters beyond taste: this app
 * ships a CSP whose whole purpose is that no string from outside becomes markup, and a
 * translation file is exactly such a string.
 *
 * A locale that does not contain the word simply renders as plain text — no link, no
 * crash, nothing missing but the affordance.
 */
function PoweredBy({ text }: { text: string }) {
    const [before, ...rest] = text.split('Sumsub')
    if (!rest.length) return <>{text}</>

    return (
        <>
            {before}
            <a
                data-testid="identification-sumsub-link"
                href={SUMSUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="type-dense-strong rounded-(--radius-sm) text-(--text-link) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                Sumsub
            </a>
            {rest.join('Sumsub')}
        </>
    )
}

/**
 * The screen someone sees before they start: what the check is, what they need to hand,
 * and the consent that has to be given before any of it is collected.
 *
 * Ported from legacy's `initializeIdentity`, with DS components in place of MUI and one
 * deliberate behavioural change:
 *
 * **The consent box starts unticked.** Legacy ships it pre-ticked (`useState(true)`), so
 * the default is consent to biometric processing given by inaction. That is not consent in
 * any of the regimes this applies under — the GDPR wants an affirmative act, and this is
 * special-category data — and it is one line to change back if the business decides
 * otherwise. Everything else about the screen is legacy's.
 *
 * The action bar is `sticky`, not `fixed` as legacy has it. Sticky keeps it inside the column,
 * so it inherits the 612px cap and the centring instead of restating both against the
 * viewport — and it keeps its space in flow, which is what makes the bottom of the page
 * readable with no reserve under the content (see the note in the render). The one thing
 * sticky does not know about is the mobile tab bar, hence the 84 on its offset.
 *
 * ## Signed out (`signedIn={false}`)
 *
 * The app always holds a session, so "signed out" here means **no real account**: nobody, or
 * an anonymous session. Everything explaining the check stays on screen — someone arriving on
 * a shared link should be able to read what this is — but the action bar swaps to a sign-in
 * prompt, and **the consent box is not shown at all**.
 *
 * That is not tidiness. Consent has to be given by the person whose biometric data it is, at
 * the moment they start; a tick collected from an anonymous session belongs to nobody, and
 * carrying it across a sign-in would mean the account that eventually submits never agreed to
 * anything. Legacy shows the consented form to everyone and only discovers the problem at the
 * press (`btnIdentification` raises the login dialog), which reads as a form that lied about
 * being usable.
 */
export function IdentityIntro({
    onStart,
    isStarting,
    signedIn,
}: {
    /** Also the signed-out handler: gated by `useRequireAuth`, so it raises the dialog. */
    onStart: () => void
    isStarting: boolean
    /** A **real** account — an anonymous session is not one. */
    signedIn: boolean
}) {
    const { t } = useTranslation()
    const [consented, setConsented] = useState(false)
    const consentId = useId()

    return (
        <div className="flex flex-1 flex-col">
            {/*
             * **No bottom reserve under the content, unlike legacy's `mb: '170px'`.**
             *
             * The bar below is sticky, which means it is still in flow and still occupies its
             * own space at the end of the column — so at the bottom of the scroll it settles
             * into that space and everything above it is readable. Nothing is ever permanently
             * covered, and no padding is needed to guarantee that.
             *
             * It does cover content *mid-scroll*, and that is what a pinned action bar does on
             * every mobile screen that has one — legacy included, which is why legacy needed
             * the 170: its bar is `position: fixed`, so it has no space in flow to settle into
             * and would sit over the last card forever without a reserve. (Measured: a
             * matching reserve here leaves ~200px of dead space at the end of the page and
             * buys nothing.)
             */}
            <div
                className={cn(
                    'flex flex-col gap-4 px-3 pt-3 pb-6 md:gap-6 md:px-6 md:pt-6',
                    // The panel is on the content, not on the page: the action bar below stays
                    // a thing that floats over it (mobile) or beside it (md), which is what
                    // keeps it reading as chrome rather than as the last row of the form.
                    IDENTIFICATION_PANEL,
                )}
            >
                <div className={cn('flex justify-center', RISE)}>
                    <Image
                        // Decorative: the heading immediately below says what the screen
                        // is, so an alt text here would only repeat it.
                        alt=""
                        src={IDENTITY_ART.intro.src}
                        width={IDENTITY_ART.intro.width}
                        height={IDENTITY_ART.intro.height}
                        priority
                        className="h-auto w-full max-w-[300px]"
                    />
                </div>

                <div className={cn('flex flex-col gap-2', RISE)} style={riseDelay(1)}>
                    <h2 className="type-title-t1-bold text-(--text-title)">
                        {t('identification_verify_title')}
                    </h2>
                    <p className="type-dense-default text-(--text-subtitle)">
                        {t('identification_verify_description')}
                    </p>
                </div>

                <div className={cn('flex flex-col gap-2', RISE)} style={riseDelay(2)}>
                    <h3 className="type-body-strong text-(--text-title)">
                        {t('identification_requirements_title')}
                    </h3>
                    {/*
                     * The checklist sits on a Card rather than bare on the page background, so
                     * the two blocks that *promise* something — what you need, and what happens
                     * to your data — read as one pair of panels under the copy instead of one
                     * floating list and one card. Same `basic` Card as below, same 12 padding.
                     *
                     * `items-center` on the row, not `items-start`: every line is one line at
                     * these widths except the camera one, which wraps to two on a narrow phone —
                     * and a tick pinned to the top of a two-line row reads as a bullet for the
                     * first line only.
                     */}
                    <Card type="basic" className="p-3">
                        {/* The list stays a real `ul` inside the Card — `Card` renders a plain
                            `div` with no `asChild`, and three requirements are a list whether or
                            not they are in a panel. */}
                        <ul className="flex w-full list-none flex-col gap-3 p-0">
                            {REQUIREMENTS.map(key => (
                                <li key={key} className="flex items-center gap-2">
                                    <Icon
                                        name="check-circle"
                                        weight="filled"
                                        size={18}
                                        aria-hidden
                                        className="shrink-0 text-(--accents-success-active)"
                                    />
                                    <span className="type-body-emphasis text-(--text-title)">
                                        {t(key)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>

                <Card
                    type="basic"
                    className={cn('flex-col items-start gap-1 p-3', RISE)}
                    style={riseDelay(3)}
                >
                    <div className="flex items-center gap-2">
                        <Icon
                            name="shield"
                            weight="filled"
                            size={20}
                            aria-hidden
                            className="shrink-0 text-(--accents-success-active)"
                        />
                        <span className="type-dense-emphasis text-(--text-title)">
                            {t('identification_data_protected')}
                        </span>
                    </div>
                    <p className="type-caption-meta text-(--text-subtitle)">
                        <PoweredBy text={t('identification_powered_by_sumsub')} />
                    </p>
                </Card>
            </div>

            {/*
             * `bottom-0` at every width, because **this route has no tab bar to clear.**
             *
             * `TabBarShell` renders the mobile bar and its 84px reserve only on the four tab
             * destinations (`lib/tab-destinations.ts`), and `/identification` is not one — the
             * bar's job is to say where you are among the tabs, and here it would say nothing
             * while covering 84px. So there is nothing at the bottom edge to sit above.
             *
             * Holding the bar at 84 anyway is not a harmless margin: with no reserve the column
             * is exactly the window's height, so the document does not scroll — and an offset
             * bar then covers the last ~50px of content with no way to scroll it into view.
             * Measured on a 390×844 phone: the whole "Your data is protected" card, gone
             * (clearance −43px, `scrollHeight === innerHeight`).
             *
             * If this screen ever becomes a tab destination, the offset has to come back — and
             * it should come from `TabBarShell`, not be typed in twice.
             */}
            <div
                className={cn(
                    // No `mt-auto`. Pushing the bar to the bottom of the column is what left a
                    // hole between the last card and the bar on a desktop window taller than the
                    // content — and it buys nothing, because sticky already pins the bar when it
                    // needs pinning: short content leaves it in flow right after the cards, tall
                    // content (every phone) puts its flow position below the fold and sticky
                    // holds it at the edge.
                    'sticky bottom-0 flex flex-col gap-3 p-3',
                    'border-(--separator-default) bg-(--background-surface)',
                    // Below md the column is full-bleed, so the bar is a bottom sheet: a top
                    // edge and top corners only, because its sides are the screen's sides.
                    // From md up the column is 612 wide and those cut-off corners read as a
                    // card sliced in half — so there it becomes a whole card, floating 24
                    // above the bottom edge (the margin is inside the sticky offset).
                    'rounded-t-xl border-t md:mt-4 md:mb-6 md:rounded-xl md:border',
                    // Elevation, so the bar reads as *over* the page while content scrolls
                    // beneath it rather than as the last block on it. The `--elevation-*` ramp
                    // behind `shadow-lg` is mode-aware, so this is one class in both themes.
                    'shadow-lg',
                    RISE,
                )}
                style={riseDelay(4)}
            >
                {signedIn ? (
                    <div className="flex items-start gap-2">
                        <Checkbox
                            data-testid="identification-consent"
                            id={consentId}
                            checked={consented}
                            onChange={event => setConsented(event.target.checked)}
                        />
                        {/* The box carries no text of its own, so the copy is the label — which
                            also makes the whole paragraph a hit target for the checkbox. */}
                        <label
                            htmlFor={consentId}
                            className="type-caption-meta cursor-pointer text-(--text-subtitle)"
                        >
                            {t('identification_consent')}
                        </label>
                    </div>
                ) : (
                    // Says what the button will do before it is pressed, in the same slot the
                    // consent text occupies — so the bar keeps its shape and a visitor is not
                    // told "sign in" only *after* reaching for Continue.
                    <p className="type-caption-meta text-(--text-subtitle)">
                        {t('auth_sign_in_to_continue')}
                    </p>
                )}
                <Button
                    data-testid="identification-continue"
                    id="identification-continue-btn"
                    size="large"
                    fullWidth
                    // Signed out there is nothing to consent to yet, so the only thing that can
                    // disable the button is a request already in flight.
                    disabled={(signedIn && !consented) || isStarting}
                    // The button says it is working, not a child of it: an `aria-label` on the
                    // loader would be concatenated into the button's own accessible name
                    // ("Continue Loading…"), i.e. the control would rename itself mid-press.
                    aria-busy={isStarting || undefined}
                    onClick={onStart}
                    // A press that moves. The DS draws no pressed state for Button (Figma
                    // models Hover and Disabled only), so this is an addition — the same one
                    // `PageBackBar` makes for the bar's own button, one step smaller because a
                    // full-width bar travelling 3% is a visible lurch.
                    className="active:not-disabled:scale-[0.99]"
                >
                    {/*
                     * The label does not change while starting. Swapping it for "Loading…"
                     * moves the text, changes the button's width mid-press and loses the one
                     * word that says what is about to happen; the DS's own working indicator
                     * next to it says the same thing without taking anything away.
                     *
                     * Signed out it is "Sign in", not "Continue": the press opens the sign-in
                     * dialog, and a button should be named after what it does.
                     *
                     * `bg-current` on the dots because `--opacity-labels-55` is a translucent
                     * near-black — correct on a page, invisible on a primary button, whose
                     * fill is Zinc 950. `currentColor` here is `--button-primary-text`.
                     */}
                    {signedIn ? t('common_continue') : t('auth_sign_in')}
                    {isStarting ? <Loader className="size-5 [&>span]:bg-current" /> : null}
                </Button>
            </div>
        </div>
    )
}
