'use client'

import { PageSurface } from '@shared/components/page-surface'
import { useTranslation } from '@shared/i18n/use-translation'
import { POP, RISE, riseDelay } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useTwoFaChange } from '../../hooks/use-two-fa-change'
import { useTwoFaFlow } from '../../hooks/use-two-fa-flow'
import { useDisableTwoFa, useTwoFaPasscode } from '../../hooks/use-two-fa-passcode'
import { useTwoFaRecoveryEmail } from '../../hooks/use-two-fa-recovery-email'
import { useTwoFaSetup } from '../../hooks/use-two-fa-setup'
import { accountEmail } from '../../lib/account-profile'
import { toTwoFaActionErrorKey } from '../../lib/auth-error'
import { TWO_FA_ART } from '../../lib/illustrations'
import { useAuth } from '../../providers/auth-provider'
import { useAuthStore } from '../../store/auth-store'
import { PasswordStepHeader as StepHeader } from '../password/password-step-header'
import { TwoFaBackBar } from './two-fa-back-bar'
import { TwoFaChangeFlow } from './two-fa-change-flow'
import { TwoFaGate } from './two-fa-gate'
import { TwoFaRecoveryEmailFlow } from './two-fa-recovery-email-flow'
import { TwoFaSetupFlow } from './two-fa-setup-flow'

/**
 * `/settings/two-step-verification` — turn the account passcode on, change it, or turn it off.
 *
 * Ported from the Figma page **`Two-step verification`** in `Tevi Web - Version 2.0`, whose two
 * sections are the two states this screen has: *GENERAL SETTINGS: Two-step verification* (off →
 * setup) and *= on* (locked → the three management actions). Legacy's **web** app never built any of
 * it; only the mobile apps did, which is why the copy exists in all nine of its locale files and none
 * of its components.
 *
 * ## The screen is locked, not the individual actions
 *
 * For an account that has the factor on, the page opens on *Enter passcode* (`TwoFaGate`) and the
 * three rows appear only behind it — comps `1077:81293` and `1081:93179`. That is the opposite of the
 * first version of this file, which showed a status card plus per-action gating, and it is the design
 * for a reason the comps make plain: each of the three actions needs the passcode anyway (`PATCH`
 * takes it as a field, `DELETE` carries no proof of anything at all), so asking once at the door is
 * one prompt instead of three. `TwoFaGate` argues the `CLAUDE.md` "gate the action, never the route"
 * question, which is about **sessions** rather than re-auth.
 *
 * ## One back control, and it walks the flows
 *
 * The comps draw exactly one back affordance — the round button in the bar — on all eleven screens.
 * So the bar is rendered *here* rather than in `page.tsx` and handed a step-aware `onBack`
 * (`TwoFaBackBar`, which also explains why it is not `PageBackBar`). That is why all three machines
 * are mounted at this level: `useTwoFaFlow` for the gate, `useTwoFaSetup` and `useTwoFaChange` for
 * the two flows. Each is idle until driven, and each exposes the `canGoBack` the one button reads.
 *
 * It is also what lets the change flow re-raise the gate: `change.needsReauth` is a boolean this
 * component already holds, so the gate is *rendered on* it rather than pushed up through a callback
 * fired from an effect.
 *
 * ## Outcomes are toasts, not panels
 *
 * A finished change or a disable returns to the state it belongs to and says so in a toast — comp
 * `1082:139165` shows the menu with one. The screen behind is the answer ("the menu is back, and it
 * did not ask for a passcode again"); a success panel would be a screen whose only content is a
 * sentence the reader has to dismiss.
 *
 * ## All three management actions are here
 *
 * *Change recovery email* was left out of the first cut, then built against two wrong endpoints, then
 * corrected against the auth contract — it goes through **`POST v1/recovery-email/verify/`** and
 * **`PATCH v1/recovery-email/`**, a family at the auth root rather than under `two-fa/`.
 * `useTwoFaRecoveryEmail` is the record of what each wrong turn cost and how it was caught, because
 * every one of them looked reasonable from inside the code.
 *
 * (The intro and success **illustration** was the other early gap and is closed too — `TWO_FA_ART`,
 * whose module explains why it is the one asset here that is not a `build-cdn-art.mjs` row.)
 */

/** Which flow has taken the screen over. `null` renders whatever the account's state says. */
type Mode = null | 'setup' | 'change' | 'recovery-email'

/**
 * The card padding the two **centred** screens use, overriding `PageSurface`'s own 24.
 *
 * 36 horizontal and 28 top, which are the sums the comps' nested frames produce (12 + 24, and
 * 16 + 12) — see `Centred`. Only these two screens take it: the flow steps sit on `PageSurface`'s
 * default, which is what *their* comps measure.
 */
const CENTRED_CARD = 'md:px-9 md:py-7'

/**
 * The card padding the three **flow** screens use — the gate, setup, change.
 *
 * 48 horizontal and 40 top, and those are the comps' own sums again: `Content Container` pads 16/24
 * and the block inside it pads 24, so the content column is **516** in a 612 card (Figma
 * `1077:81293`, `1070:93787`, `1081:93328` — all three identical). `PageSurface`'s default 24 left
 * the column 48px wider than every comp on the page, which is the sort of thing that reads as
 * "roughly right" until you put the two side by side.
 *
 * Different from `CENTRED_CARD` because the comps *are* different: those two screens nest a reused
 * empty-state component and land on 36/28 instead.
 */
const FLOW_CARD = 'md:px-12 md:pt-10'

export function TwoFaSettings() {
    const { t } = useTranslation()
    const router = useRouter()
    /*
     * **`auth_two_fa_page_title`, not `auth_two_fa_flow_title`.** Same words, two surfaces: the comps
     * set the bar in sentence case (`Two-step verification`, node `1072:79000`) and the withdrawal
     * dialog's band in Title Case, which is legacy's own split — the drawer row that leads here is
     * sentence case too. One string for both printed "Two-Step Verification" over a page whose every
     * other label is sentence case.
     */
    const { currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const openLoginDialog = useAuthStore(s => s.openLoginDialog)
    const { isEnabled, hint, refresh } = useTwoFaPasscode()
    const { disable, isPending: isDisabling } = useDisableTwoFa()

    const [mode, setMode] = useState<Mode>(null)
    /** The passcode has been proved in this visit. Never persisted — a reload asks again. */
    const [verifiedPasscode, setVerifiedPasscode] = useState<string | null>(null)
    /** The setup flow just finished. Outranks `isEnabled`, so the refetch cannot swap the screen out. */
    const [justEnabled, setJustEnabled] = useState(false)
    const [confirmingDisable, setConfirmingDisable] = useState(false)
    const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)

    /** Leave the route — what the bar does at a root state, and what *Back to settings* means. */
    const leaveRoute = useCallback(() => {
        if (window.history.length > 1) router.back()
        else router.push('/')
    }, [router])

    /*
     * The gate. `onVerified` is the only way past it, and the passcode is kept because the two writes
     * behind it need it as a field — `PATCH` presents it, and `DELETE` is only *offered* once it has
     * been proved (the endpoint itself takes no body).
     */
    const gate = useTwoFaFlow(
        useCallback((passcode: string) => {
            setVerifiedPasscode(passcode)
            setActionErrorKey(null)
        }, []),
    )

    const setup = useTwoFaSetup({
        initialEmail: accountEmail(currentUser) ?? undefined,
        onEnabled: useCallback(() => {
            setJustEnabled(true)
            refresh()
        }, [refresh]),
    })

    const change = useTwoFaChange({
        currentPasscode: verifiedPasscode,
        onChanged: useCallback(() => {
            setMode(null)
            toast.success(t('auth_two_fa_change_done'))
            refresh()
        }, [refresh, t]),
    })

    /*
     * No passcode and no hint: `PATCH v1/recovery-email/` takes `{ recovery_email, otp }` alone. The
     * screen still sits behind the gate — it is one of the three management actions — but the
     * endpoint's own authority is the emailed code.
     */
    const recovery = useTwoFaRecoveryEmail({
        onChanged: useCallback(() => {
            setMode(null)
            toast.success(t('auth_two_fa_recovery_email_done'))
            refresh()
        }, [refresh, t]),
    })

    // ---- signed out, and still bootstrapping ------------------------------------------------

    if (!isAuthenticated && !isBootstrapping) {
        return (
            <Screen title={t('auth_two_fa_page_title')}>
                <PageSurface>
                    <StepHeader
                        icon={{ name: 'shield', weight: 'filled' }}
                        tone="brand"
                        /*
                         * **Not `auth_two_fa_flow_title`.** The bar above already prints that exact
                         * string, and measured in the browser the screen read "Two-Step Verification"
                         * twice, 60px apart — the duplication `TwoStepVerificationDialog` records
                         * fixing in its own band. The panel names what the reader could *do*; the bar
                         * names where they are.
                         */
                        title={t('auth_two_fa_intro_title')}
                        description={t('auth_two_fa_signed_out_description')}
                    />
                    <Button
                        data-testid="auth-two-fa-sign-in"
                        size="large"
                        onClick={openLoginDialog}
                        className={cn('self-start active:scale-[0.99]', RISE)}
                        style={riseDelay(2)}
                    >
                        {t('auth_sign_in')}
                    </Button>
                </PageSurface>
            </Screen>
        )
    }

    if (isBootstrapping) {
        return (
            <Screen title={t('auth_two_fa_page_title')}>
                {/*
                 * The bars sit at the real heights of what replaces them — a 56px mark, a title line,
                 * a body line, one button — so nothing jumps when the session lands.
                 * `/settings/password` records why a hand-measured skeleton is worse than one built
                 * from the same parts.
                 */}
                <PageSurface aria-busy="true">
                    <Skeleton h={56} circle w={56} />
                    <div className="flex flex-col gap-2">
                        <div className="flex h-[36px] items-center">
                            <Skeleton w="55%" />
                        </div>
                        <Skeleton w="80%" />
                    </div>
                    <Skeleton h={48} className="rounded-lg" />
                </PageSurface>
            </Screen>
        )
    }

    // ---- the setup flow, and the screen it ends on ------------------------------------------

    const leaveSetup = () => {
        setMode(null)
        setup.restart()
    }

    if (justEnabled) {
        return (
            <Screen title={t('auth_two_fa_page_title')}>
                <PageSurface className={cn(CENTRED_CARD, 'md:flex-1', RISE)}>
                    <Centred
                        // `POP` rather than `RISE`: an outcome *lands*. `PasswordDone`'s call.
                        markMotion={POP}
                        title={t('auth_two_fa_enabled_title')}
                        body={t('auth_two_fa_enabled_body')}
                        cta={t('auth_two_fa_back_to_settings')}
                        testId="auth-two-fa-setup-done"
                        onPress={leaveRoute}
                    />
                </PageSurface>
            </Screen>
        )
    }

    if (mode === 'setup') {
        return (
            <Screen
                title={t('auth_two_fa_page_title')}
                onBack={setup.canGoBack ? setup.back : leaveSetup}
                barDisabled={setup.busy}
            >
                <PageSurface className={cn(FLOW_CARD, 'md:flex-1', RISE)}>
                    <TwoFaSetupFlow setup={setup} />
                </PageSurface>
            </Screen>
        )
    }

    // ---- two-step verification is off ------------------------------------------------------

    /*
     * ⚠ **The intro says "password" and the very next step says "passcode", and that is the comps'
     * own wording, kept on purpose.**
     *
     * `auth_two_fa_intro_body` / `_cta` are legacy's `two_step_verification_w2_create_a_password_to_add`
     * and `..._create_password` verbatim, in every locale that has them — this screen is a 1:1 port and
     * the copy is the design's to own. It is worth knowing what it costs, because nothing else in the
     * app talks this way: the six boxes two screens later take a **6-digit code**, every later step and
     * the withdrawal dialog say *passcode*, and the drawer lists this row directly under **Password**,
     * which is the account's real sign-in password (`/settings/password`). So one drawer prints
     * "Password" and "Create Password" for two unrelated credentials.
     *
     * Changed on an explicit call to match Figma rather than the app's vocabulary. If it reads wrong in
     * QA it is two strings per locale, and `auth_two_fa_create_title` ("Create passcode") is the
     * wording the rest of the flow would pull them towards.
     */

    if (!isEnabled) {
        return (
            <Screen title={t('auth_two_fa_page_title')}>
                <PageSurface className={cn(CENTRED_CARD, 'md:flex-1', RISE)}>
                    <Centred
                        title={t('auth_two_fa_intro_title')}
                        body={t('auth_two_fa_intro_body')}
                        cta={t('auth_two_fa_intro_cta')}
                        testId="auth-two-fa-setup-start"
                        onPress={() => {
                            setActionErrorKey(null)
                            setup.restart()
                            setMode('setup')
                        }}
                    />
                    {actionErrorKey ? <ErrorNotice text={t(actionErrorKey)} /> : null}
                </PageSurface>
            </Screen>
        )
    }

    // ---- two-step verification is on -------------------------------------------------------

    /*
     * The gate is shown until the passcode is proved — and again the moment a management write says
     * the passcode was refused. `change.needsReauth` is state this component holds, so the second case
     * is a render rather than an effect.
     */
    const locked = verifiedPasscode === null || change.needsReauth

    if (locked) {
        return (
            <Screen
                title={t('auth_two_fa_page_title')}
                onBack={gate.canGoBack ? gate.back : undefined}
                barDisabled={gate.busy}
            >
                <PageSurface className={cn(FLOW_CARD, 'md:flex-1', RISE)}>
                    {/*
                     * A passcode that has just been *replaced* through the recovery chain, or one the
                     * write refused — both are things the reader has to be told before they retype
                     * six digits. The flow's own note wins where both exist: it is the more recent.
                     */}
                    {gate.justReset ? (
                        <Notice
                            testId="auth-two-fa-reset-note"
                            text={t('auth_two_fa_reset_done')}
                        />
                    ) : change.needsReauth && change.errorKey ? (
                        <ErrorNotice text={t(change.errorKey)} />
                    ) : null}
                    <TwoFaGate flow={gate} hint={hint} />
                </PageSurface>
            </Screen>
        )
    }

    if (mode === 'change') {
        return (
            <Screen
                title={t('auth_two_fa_page_title')}
                onBack={
                    change.canGoBack
                        ? change.back
                        : () => {
                              setMode(null)
                              change.restart()
                          }
                }
                barDisabled={change.busy}
            >
                <PageSurface className={cn(FLOW_CARD, 'md:flex-1', RISE)}>
                    <TwoFaChangeFlow change={change} />
                </PageSurface>
            </Screen>
        )
    }

    if (mode === 'recovery-email') {
        return (
            <Screen
                title={t('auth_two_fa_page_title')}
                onBack={
                    recovery.canGoBack
                        ? recovery.back
                        : () => {
                              setMode(null)
                              recovery.restart()
                          }
                }
                barDisabled={recovery.busy}
            >
                <PageSurface className={cn(FLOW_CARD, 'md:flex-1', RISE)}>
                    <TwoFaRecoveryEmailFlow flow={recovery} />
                </PageSurface>
            </Screen>
        )
    }

    // ---- unlocked: the three actions -------------------------------------------------------

    const runDisable = async () => {
        // The gate is what produced it, and `locked` above is what guarantees it is not null here.
        if (!verifiedPasscode) return
        setActionErrorKey(null)
        try {
            await disable(verifiedPasscode)
            /*
             * Straight to the off state — `refresh` inside `useDisableTwoFa` re-reads `/me`, and
             * `verifiedPasscode` is dropped because there is no longer a passcode it could authorise.
             *
             * ⚠ A **divergence from the comps**, which show the management menu again after a
             * successful disable (`1082:142785`). That cannot be right: the three rows are all about
             * a passcode the account no longer has, and *Change* would 4xx on the first press. Read as
             * a mock the designer did not re-point rather than as an intention.
             */
            setVerifiedPasscode(null)
            toast.success(t('auth_two_fa_disabled_done'))
        } catch (error) {
            /*
             * `toTwoFaActionErrorKey`, not the passcode mapper: this call carries no code, so reading
             * its 4xx as "wrong code" would report a refusal about something the reader never typed —
             * the exact bug that mapper was split out to fix. Transport failures keep their own
             * sentences, which matters most here: a throttle told as "couldn't turn it off" sends
             * somebody retrying into the same wall.
             */
            setActionErrorKey(toTwoFaActionErrorKey(error, 'auth_two_fa_disable_failed'))
        }
    }

    return (
        <Screen title={t('auth_two_fa_page_title')}>
            {/*
             * **Three separate cards with an 8px gap, not one list with rules** — comp `1081:137863`
             * and its two siblings: each is 612×72, `rounded-xl` (16, the DS's own `--radius-xl`) on
             * `--background-surface`, padding 12/24, holding a 48px `List/Action` row.
             *
             * So this is *not* `ActionRows`: that component draws one rounded surface with coloured
             * 32px tiles and rules between rows, which is `/my-wallet`'s shape and not this one. The
             * comps give these rows no leading tile at all.
             */}
            {/* The comps' order: change, turn off, change recovery email (`1081:93179`). */}
            <div className={cn('flex flex-none flex-col gap-2 px-4 md:px-0', RISE)}>
                <MenuRow
                    testId="auth-two-fa-action-change"
                    label={t('auth_two_fa_action_change')}
                    onClick={() => {
                        setActionErrorKey(null)
                        change.restart()
                        setMode('change')
                    }}
                />
                <MenuRow
                    testId="auth-two-fa-action-disable"
                    label={t('auth_two_fa_action_disable')}
                    onClick={() => {
                        setActionErrorKey(null)
                        setConfirmingDisable(true)
                    }}
                />
                <MenuRow
                    testId="auth-two-fa-action-recovery-email"
                    label={t('auth_two_fa_action_recovery_email')}
                    onClick={() => {
                        setActionErrorKey(null)
                        recovery.restart()
                        setMode('recovery-email')
                    }}
                />
                {actionErrorKey ? <ErrorNotice text={t(actionErrorKey)} /> : null}
            </div>

            <ConfirmDialog
                testId="auth-two-fa-disable"
                open={confirmingDisable}
                onOpenChange={setConfirmingDisable}
                title={t('auth_two_fa_disable_title')}
                description={t('auth_two_fa_disable_body')}
                /*
                 * **Close / Confirm**, which is what the comp's dialog draws (`1082:142279`) and what
                 * legacy's own copy carries (`two_step_verification_w2_close` / `…_confirm`) — not
                 * `ConfirmDialog`'s Cancel/Continue defaults.
                 */
                cancelLabel={t('auth_two_fa_disable_close')}
                confirmLabel={t('auth_two_fa_disable_confirm')}
                destructive
                pending={isDisabling}
                onConfirm={() => {
                    setConfirmingDisable(false)
                    void runDisable()
                }}
            />
        </Screen>
    )
}

/**
 * The bar, the column and its width — the frame every state above renders into.
 *
 * A local component rather than the page's job, because the bar's `onBack` changes with the state and
 * `page.tsx` cannot see it. `pb-6` and no top padding: `AppBar` already carries 8px of clear space
 * below its contents, and a column that adds its own is asking for the gap twice (`PageBackBar`'s
 * note, which every sub-page in this app now follows).
 */
function Screen({
    title,
    onBack,
    barDisabled,
    children,
}: {
    title: string
    onBack?: () => void
    barDisabled?: boolean
    children: React.ReactNode
}) {
    return (
        <>
            <TwoFaBackBar title={title} onBack={onBack} disabled={barDisabled} />
            <div className="mx-auto flex w-full flex-1 flex-col pb-6 md:max-w-[612px]">
                {children}
            </div>
        </>
    )
}

/**
 * The two centred states — *Set Up Two-Step Verification* and *Two-Step Verification Enabled*.
 *
 * Both comps are the **same object**, node for node (`1072:79001` and the twin inside `1077:80681`),
 * so one component draws both. Every number below is measured off them rather than chosen:
 *
 * ```
 * Content Container  612   radius 16, pad 16/0    ← the card
 * └ Supporter        612   pad 12,  gap 12
 *   └ No Post        588   pad 0/24, gap 24
 *     ├ Image        540   pad-bottom 12
 *     │ ├ art        190×127
 *     │ └ Text       540   gap 0 — title 16/SemiBold/150%, body 16/Regular/140%, both #141414
 *     └ Button       540×48, radius 8, #501BC0
 * ```
 *
 * Three of those contradict what this file had, and each was a guess dressed as a rule:
 *
 * - **The body is 16px, not 14**, and it is the **same ink as the title** — not a subtitle grey. The
 *   two lines are one statement in the comps; demoting the second one to `--text-subtitle` made it
 *   read as a caption under a heading.
 * - **No `max-w-[400px]`.** That is this repo's empty-state rule, and this is not an empty state — the
 *   comps run the body the full 540 and the sentence fits on two lines there.
 * - **The column is 540 inside a 612 card**, i.e. 36 each side, which is `Supporter`'s 12 plus
 *   `No Post`'s 24. It is a nested-component artifact rather than a designed step, and it is still
 *   what the screen measures — `px-9`/`pt-7` are those sums, not numbers off the spacing ramp.
 *
 * **`accent`.** The comps fill both buttons with `#501BC0`, and in this DS that is the **accent**
 * variant (`--button-accent-bg` → `--primary-500`); `primary` is `--zinc-950`, the neutral press. The
 * ramp is called Primary and the variant is not, which is how this shipped black for one round.
 *
 * The **illustration** is `TWO_FA_ART` — the comps' own raster, out of the design file rather than
 * the CDN because it was never published there. Its module carries the node id and why it is not a
 * `build-cdn-art.mjs` row.
 */
function Centred({
    title,
    body,
    cta,
    testId,
    onPress,
    markMotion = RISE,
}: {
    title: string
    body: string
    cta: string
    testId: string
    onPress: () => void
    markMotion?: string
}) {
    return (
        <div className="flex flex-none flex-col items-center gap-6 text-center">
            {/* The art and the two lines: one block, 12px apart, because the comps bind them in one
                frame (`Image Container`, pad-bottom 12) and put the 24 between *that* and the button. */}
            <div className="flex flex-col items-center gap-3">
                {/*
                 * `aria-hidden`: the heading directly below says what the screen is, so a label here
                 * would only repeat it — and the art carries no information the copy does not.
                 *
                 * `width`/`height` from `TWO_FA_ART` rather than classes, so `next/image` reserves the
                 * box and the two lines below do not jump when the file lands. `priority` because it is
                 * above the fold on the one screen this account came here to read; without it the
                 * lazy loader waits for layout and the card paints empty for a beat.
                 */}
                <Image
                    src={TWO_FA_ART.src}
                    width={TWO_FA_ART.width}
                    height={TWO_FA_ART.height}
                    alt=""
                    aria-hidden
                    priority
                    className={markMotion}
                />
                {/* `gap-0`: the comps' Text Container has none, and the 150% line-height is what
                    separates the two lines. */}
                <div className={cn('flex flex-col items-center', RISE)} style={riseDelay(1)}>
                    {/* `h2`, not `h1`: the page's own `h1` is the bar's title. */}
                    <h2 className="type-body-strong m-0 text-(--text-title)">{title}</h2>
                    {/* 16/Regular in the **title** ink. The comps' 140% line-height is not in the DS
                        scale (which has 1.5 and 1.2), so `type-body-default` is the nearest style and
                        `CLAUDE.md` forbids setting one by hand. */}
                    <p className="type-body-default m-0 text-(--text-title)">{body}</p>
                </div>
            </div>
            <Button
                data-testid={testId}
                variant="accent"
                size="large"
                fullWidth
                onClick={onPress}
                // The DS draws no pressed state for Button; one step smaller than the usual 3%,
                // because a full-width button travelling that far is a visible lurch.
                className={cn('active:scale-[0.99]', RISE)}
                style={riseDelay(2)}
            >
                {cta}
            </Button>
        </div>
    )
}

/**
 * One management row — its own card, a 16/500 label and a chevron.
 *
 * Built from the DS `List/Action` parts rather than a bare `<button>`: the row *is* the control, so it
 * has to be keyboard-reachable, and `ListRow` carries the 48px box, the 0/16 padding and the text
 * column the comps measure.
 */
function MenuRow({
    label,
    onClick,
    testId,
}: {
    label: string
    onClick: () => void
    testId: string
}) {
    return (
        <div className="flex-none overflow-hidden rounded-xl bg-(--background-surface) px-6 py-3">
            <ListRow
                data-testid={testId}
                as="button"
                onClick={onClick}
                rightAction
                className="cursor-pointer text-start"
            >
                <ListRowContent>
                    {/* `rightAction` on **both** — without it `ListRowText` takes `w-full` instead of
                        `min-w-0 flex-1` and a long label pushes the chevron off the row. */}
                    <ListRowAccessory rightAction>
                        <ListRowText rightAction>
                            <ListRowTitleRow>
                                {/* `type-body-emphasis` (16/500) over `ListRowTitle`'s own
                                    `type-body-strong` (16/600): the comps' rows are Medium
                                    (`1081:137890`), and at this size the two weights are visibly
                                    different next to a page with no other bold text on it. */}
                                <ListRowTitle className="type-body-emphasis truncate">
                                    {label}
                                </ListRowTitle>
                            </ListRowTitleRow>
                        </ListRowText>
                        <ListRowTrailing>
                            <Icon
                                name="angle-right"
                                size={20}
                                aria-hidden
                                // The chevron points the way the language reads.
                                className="text-(--text-body) rtl:-scale-x-100"
                            />
                        </ListRowTrailing>
                    </ListRowAccessory>
                </ListRowContent>
            </ListRow>
        </div>
    )
}

/**
 * A tinted block, and **not** green or red text.
 *
 * Measured on the panel ground: `--accents-success-active` is 2.32:1 there, well under AA for 14px,
 * and the token does not flip between modes — so it reads fine in Dark and fails where most people
 * will see it. On the DS's own tint, `--text-title` is 18.06. Same finding
 * `TwoStepVerificationDialog` and `PayoutConfirmDialog` record: at these tiers the accent inks are
 * for *marks*, not for sentences.
 */
function Notice({ text, testId }: { text: string; testId: string }) {
    return (
        <p
            aria-live="polite"
            data-testid={testId}
            className="type-dense-default m-0 rounded-lg bg-(--accents-success-bg-active) px-4 py-3 text-(--text-title)"
        >
            {text}
        </p>
    )
}

/**
 * The failure block — `--text-error` on the error tint, which is `auth-error-message.tsx`'s and
 * `forgot-password-flow.tsx`'s pair, copied so the 2FA screens read like the sign-in ones.
 *
 * ⚠ **Measured while fixing the dark-mode disc, and worth knowing**: that ink is `#ff3636` and does
 * **not** flip between modes, so on the tint it is **3.29** in Light and 4.74 in Dark — and on the
 * bare card it is **3.60** / 4.92. The Light tint therefore reads *worse* than no tint at all, and
 * both are under AA's 4.5 for text this size. `Notice` above shows what the fix looks like when a
 * screen is free to choose: `--text-title` on the DS's own tint is 18.06.
 *
 * Not changed here, deliberately. It is the feature-wide pair, the comps draw the failure line in
 * red, and three files of mine diverging from the other two auth surfaces would be worse than the
 * contrast. It belongs in `docs/DESIGN_SYSTEM.md` as one decision, with these numbers.
 */
function ErrorNotice({ text }: { text: string }) {
    return (
        <p
            role="alert"
            data-testid={subTestId('auth-two-fa', 'error')}
            className={cn(
                'type-dense-default m-0 w-full rounded-lg px-4 py-3',
                'bg-(--accents-error-bg-active) text-(--text-error)',
                RISE,
            )}
        >
            {text}
        </p>
    )
}
