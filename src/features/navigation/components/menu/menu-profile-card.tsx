'use client'

import { accountDisplayName, accountUserId, useAuth, useRequireAuth } from '@features/auth'
import { ChannelVerifiedMark, useMyChannel } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { PREMIUM_SHEEN } from '@shared/lib/motion'
import { PREMIUM_GOLD } from '@shared/lib/premium-gold'
import { cn } from '@shared/lib/utils'
import { Card, CardTrailing } from '@shared/ui/card'
import { Icon } from '@shared/ui/icon'
import {
    LeftBarProfileContent,
    LeftBarProfileHandle,
    LeftBarProfileMeta,
    leftBarProfileCopyClass,
} from '@shared/ui/left-bar'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAvatarSource } from '../../hooks/use-avatar-source'
import { useDrawerNavigate } from '../../hooks/use-drawer-navigate'
import { useMenu } from '../../providers/menu-state'

/**
 * The account drawer's first card — who you are signed in as (Figma 3626:26373, the Left Bar's
 * profile card), and legacy's `iconBtnMenu/menu/content/user`.
 *
 * ## Three states, because the drawer is mounted for everybody
 *
 * The shell renders this on every page and every kind of visit, so "signed in" is one of three
 * answers and the other two are not edge cases:
 *
 * - **Bootstrapping** — a skeleton. The session is resolved on the client, so a returning account
 *   is momentarily indistinguishable from a guest; printing "Sign up / Log in" for that moment
 *   would flash the wrong identity at the person who is already signed in, on every cold load.
 * - **Guest or anonymous** — one control that says `Sign up / Log in` and raises the sign-in
 *   dialog. Legacy replaces the whole card with a button here; this keeps the card, because the
 *   rest of this drawer already renders every row for a guest and gates the press
 *   (`CLAUDE.md`: gate the action, never the route). `isAuthenticated` is already
 *   `id && !anonymous`, so an anonymous session — which every visitor has — lands here.
 * - **Signed in** — name, `@slug`, the verified mark, and the account's user ID with a control
 *   that copies it.
 *
 * ## The card is one link, and the copy button is not inside it
 *
 * A `<button>` nested in an `<a>` is invalid HTML and behaves differently in each browser, so
 * the link is the **name** and it stretches over the card with an `after:` pseudo-element. The
 * copy control sits above that layer (`relative z-10`) and keeps its own hit area. This also
 * keeps the link's accessible name the person's own name, which is what makes the visible label
 * and the announced one the same thing.
 *
 * It goes to `/my-space`, the app's canonical "your own space" address — the same destination
 * the rail and the tab bar use, and a real `href`, so middle-click and cmd-click work. Legacy
 * opens an *Account information* dialog here instead; that screen does not exist in this app yet
 * (user ID, email and birthday, with a link to the channel), and pointing at the channel is the
 * honest subset rather than a control that does nothing.
 *
 * ## Premium: the gradient card, and one deliberate departure from the DS
 *
 * The DS draws this card as `Card type="premium"` — the purple gradient — while the web comp
 * (`My Star — Desktop`) draws it `basic`. Both are right: legacy has exactly these two variants
 * and switches on `isMyPremium`, so that is the switch here.
 *
 * **The premium surface is legacy's, not the DS's** — see `GOLD_GRADIENT` / `PREMIUM_SURFACE`
 * below for the whole argument and the values. What the DS still supplies is the geometry and the
 * ink: `PREMIUM_TOKENS` in `shared/ui/card.tsx` pins the Dark-mode text tokens a card this dark
 * needs, and three of those are additions — without them the drilldown chevron sits at 1.9:1 and
 * the copy affordance at 2.3:1 on the gradient, which is how a chevron nobody could see shipped.
 *
 * `LeftBarProfilePlan` is *not* used, and that is the one thing here the DS would do differently:
 * it pins its chip at `top: 0; right: 0` of a card that is `overflow: hidden` with a 16px radius,
 * so the pill's own corner is sliced off and it lands on the chevron — its own
 * `preview/left-bar.html` renders it that way. `PremiumTab` fills that corner instead, which is
 * both what legacy ships and what the clipping wants to be.
 */
export function MenuProfileCard() {
    const { t } = useTranslation()
    const { currentUser, isAuthenticated, isBootstrapping } = useAuth()
    const { myChannel, isPremium } = useMyChannel()
    const avatar = useAvatarSource()
    const requireAuth = useRequireAuth()
    const { open, close } = useMenu()
    const { navigate } = useDrawerNavigate()

    const cardClass = 'relative cursor-pointer items-center'
    const type = isPremium ? 'premium' : 'basic'

    /**
     * The guest card's press. `requireAuth` is the only way in to the sign-in dialog from outside
     * `features/auth` — the store that owns it is feature-internal — so the guarded callback is
     * empty on purpose: in this branch there is no session, so the guard is the whole action.
     *
     * Closed first, and for the same reason `handleSwitchAccount` closes: the dialog portals to
     * the top of the document, so leaving the panel standing behind it stacks two overlays.
     */
    const signIn = requireAuth(() => {})
    const promptSignIn = () => {
        close()
        signIn()
    }

    if (isBootstrapping) return <MenuProfileCardSkeleton />

    // Signed out, the whole card is the sign-in prompt.
    if (!isAuthenticated) {
        return (
            <Card type="basic" className={cardClass}>
                {/*
                 * The placeholder glyph, not `avatar` — an anonymous session carries one of the
                 * CDN's default faces, and painting it beside "Sign up / Log in" shows a visitor a
                 * portrait that belongs to no account of theirs.
                 */}
                <AnimatedAvatar
                    thumb={null}
                    avatarVideo={null}
                    isPremium={false}
                    alt=""
                    size="large"
                />
                <LeftBarProfileContent>
                    <LeftBarProfileHandle
                        name={
                            <button
                                data-testid="navigation-menu-sign-in"
                                type="button"
                                onClick={promptSignIn}
                                className={STRETCH_CLASS}
                            >
                                {t('menu_profile_sign_in')}
                            </button>
                        }
                        at={null}
                    />
                    {/* One line, always: the card is 342 wide minus an avatar and a chevron, and a
                        hint that wraps makes the signed-out card taller than the signed-in one. */}
                    <LeftBarProfileMeta className="text-(--text-subtitle)">
                        <span className="min-w-0 truncate">{t('menu_profile_sign_in_hint')}</span>
                    </LeftBarProfileMeta>
                </LeftBarProfileContent>
                <CardTrailing type="option">
                    <Icon name="angle-right" size={20} className="rtl:-scale-x-100" />
                </CardTrailing>
            </Card>
        )
    }

    /**
     * `display_name`, then the slug, then a named fallback — never blank. The slug arrives with
     * `my-channel/`, which resolves after `/me`, so it is missing for a moment on a cold load and
     * the handle line simply is not drawn until it is: a skeleton bar that lives for one request
     * on a line most people never read is more movement than the thing it stands in for.
     */
    const name = accountDisplayName(currentUser) ?? myChannel?.slug ?? t('auth_switcher_unnamed')
    const id = accountUserId(currentUser)

    const card = (
        <Card
            type={type}
            className={cn(
                cardClass,
                /*
                 * The DS's premium recipe supplies the right *ink* (white title, light subtitle,
                 * and the three tokens `PREMIUM_TOKENS` adds so a chevron and a link are legible
                 * on a dark card) but the wrong *surface*: its lavender ramp and yellow inset
                 * hairline are not what Tevi ships. Both are replaced here — see PREMIUM_SURFACE.
                 */
                isPremium && `${PREMIUM_SURFACE} shadow-none`,
            )}
        >
            {isPremium ? (
                /*
                 * Legacy rings the premium avatar in the same gold gradient as the card's border
                 * and hangs the crown off its corner. Decorative, both of them: the corner tab
                 * already says "Premium" in words, so a second announcement is noise.
                 */
                <span
                    /*
                     * `flex`, not a bare block. `Avatar` is `inline-flex`, so in a block parent it
                     * sits on a text baseline and the line box adds ~6px of descender under it —
                     * the ring came out 52x58 with the avatar riding high in it and the crown
                     * hanging below the circle. A flex container has no baseline to sit on.
                     */
                    className={cn('relative flex flex-none rounded-full p-[2px]', GOLD_GRADIENT)}
                    aria-hidden
                >
                    <AnimatedAvatar {...avatar} alt="" size="large" />
                    <PremiumBadge size={16} className="absolute end-0 bottom-0" />
                </span>
            ) : (
                <AnimatedAvatar {...avatar} alt="" size="large" />
            )}
            <LeftBarProfileContent>
                <LeftBarProfileHandle
                    name={
                        /* A flex row, not two inline children: the mark is an image and the name
                           truncates, and inline the two share one line box — a long name pushes
                           the tick onto a second line instead of eliding itself. Same composition
                           as the channel header's own name row. */
                        <span className="flex min-w-0 items-center gap-1">
                            <a
                                data-testid="navigation-menu-my-space"
                                href="/my-space"
                                onClick={navigate('/my-space')}
                                aria-label={t('menu_profile_open', { name })}
                                className={cn('min-w-0 truncate', STRETCH_CLASS)}
                            >
                                {name}
                            </a>
                            {myChannel && <ChannelVerifiedMark channel={myChannel} size={16} />}
                        </span>
                    }
                    at={myChannel?.slug ? `@${myChannel.slug}` : null}
                />
                <LeftBarProfileMeta>
                    {/* `—` while unknown, the same answer the balance and Identification rows
                        give: the id is not a thing to guess at, and it is what gets copied. */}
                    <span className="min-w-0 truncate">
                        {t('menu_profile_id', { id: id ?? '—' })}
                    </span>
                    {id && <CopyIdButton id={id} />}
                </LeftBarProfileMeta>
            </LeftBarProfileContent>
            {/*
             * Centred on the premium card, top-aligned (the DS default) otherwise: the corner tab
             * occupies exactly the space `CardTrailing`'s `items-start` puts the chevron in, and
             * legacy centres it here for the same reason.
             */}
            <CardTrailing
                type="option"
                className={cn(isPremium && 'items-center text-(--text-title)')}
            >
                <Icon name="angle-right" size={20} className="rtl:-scale-x-100" />
            </CardTrailing>
            {isPremium && <PremiumTab label={t('menu_premium')} />}
        </Card>
    )

    /*
     * The 1px gold hairline is a *gradient*, which no border or inset shadow can paint — hence a
     * wrapper whose padding is the border, exactly as legacy does it. The outer radius is the
     * card's plus that 1px, or the corner shows a sliver of gold outside the curve.
     */
    if (!isPremium) return card
    return (
        <div className={cn('relative overflow-clip rounded-[17px] p-px', GOLD_GRADIENT)}>
            {card}
            {/*
             * The glare that crosses `/premium`'s recommended plan, on the other gold surface in the
             * app — `PREMIUM_SHEEN`, so the two cannot drift onto different timings. It is on the
             * **frame** rather than inside the card, which is what lets it cross the hairline and the
             * corner tab as well as the gradient: one object catching the light, not a panel with a
             * highlight in it. Last in the DOM and the only positioned child, so painting order alone
             * puts it over everything with no `z-index`.
             *
             * ⚠ **Gated on the drawer being open, and that is not a nicety.** This card is mounted on
             * every route and merely translated off-screen when the drawer is shut — measured:
             * `display: flex`, `visibility: visible`, a real width. An `infinite` animation here would
             * run for the whole session, on every page, behind a closed drawer, for every premium
             * account. `PREMIUM_SHEEN`'s own note says a loop only belongs on a surface small enough
             * to ignore; a surface nobody can see is not that, it is just work. Mounting it with
             * `open` also restarts the sweep each time the drawer opens, so the first thing a reader
             * sees is the pass rather than the middle of the pause.
             *
             * `aria-hidden` and `pointer-events-none`: it says nothing, and it lies across a link
             * that covers the whole card.
             */}
            {open && (
                <span
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute inset-0 opacity-0',
                        'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.4)_50%,transparent_62%)]',
                        PREMIUM_SHEEN,
                    )}
                />
            )}
        </div>
    )
}

/**
 * Tevi's premium surface — legacy's `iconBtnMenu/.../userPremium`, values verbatim.
 *
 * **Not the design system's premium card, and deliberately so.** The DS draws a lavender
 * `Primary 400 → 300 → 500` ramp under a flat `Accents/Yellow` hairline; the product ships a
 * near-black-to-violet ramp under a four-stop gold gradient, with a gold corner tab. Those are two
 * different surfaces, not two readings of one — and the shipped one is the one people recognise as
 * Premium, so it is what this card wears. The hexes are Tevi brand values with no token behind
 * them (the DS has no gold ramp at all), which is why they are written out rather than
 * approximated with `--accents-yellow`.
 */
const GOLD_GRADIENT = PREMIUM_GOLD

/*
 * 97deg, and mirrored to 263deg under `rtl:`. The ramp is not decoration that happens to run
 * left-to-right: its near-black end sits behind the avatar and its violet end behind the trailing
 * edge, and a physical angle would put the two the wrong way round in Arabic.
 */
const PREMIUM_SURFACE = cn(
    'bg-[linear-gradient(97deg,#040013_0.48%,#4200c7_88.23%)]',
    'rtl:bg-[linear-gradient(263deg,#040013_0.48%,#4200c7_88.23%)]',
)

/**
 * The corner tab. A rectangle that fills the card's top-end corner with only its *inner* corner
 * rounded (`rounded-es-lg` — block-end + inline-start, so it flips with the writing direction);
 * the outer two corners are cut by the card's own radius and `overflow-hidden`, which is what
 * makes it read as part of the frame rather than a chip dropped on top.
 *
 * The word is painted with the violet gradient clipped to the glyphs, so it stays legible on gold
 * where a flat `--text-title` would be near-white on near-white.
 */
function PremiumTab({ label }: { label: string }) {
    return (
        <span
            className={cn(
                'absolute top-0 end-0 rounded-es-lg border-s border-b border-[#9854ff] px-2 py-0.5',
                GOLD_GRADIENT,
            )}
        >
            <span className="type-caption-label-strong bg-[linear-gradient(90deg,#190073_0%,#4200c7_100%)] bg-clip-text text-transparent">
                {label}
            </span>
        </span>
    )
}

/**
 * The stretched link/button: normal inline text, whose *pointer* area is the whole card.
 *
 * `after:inset-0` hit-tests to its owner, so the card is one target without the name having to be
 * one. The card clips it (`overflow-hidden` on both Card variants), so it can never spill.
 */
const STRETCH_CLASS =
    'cursor-pointer rounded-(--radius-sm) after:absolute after:inset-0 after:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)'

const TOAST_ID = 'menu-copy-id'

/**
 * Copies the account's user ID.
 *
 * `relative z-10` so it stays pressable above the card-wide link layer — without it the stretched
 * pseudo-element covers this button and pressing "copy" would navigate instead.
 *
 * Two confirmations for the two people reading: a toast states the fact, and the glyph becomes a
 * tick for two seconds for the eye already on the pointer. Same pairing as `ChannelCopyLink` and
 * `CopyHexButton`, deliberately — the gesture means one thing everywhere in this app.
 *
 * The failure branch is real, not padding: `navigator.clipboard` is absent on an insecure origin
 * and can be refused by permissions policy, so the toast carries the id for selecting by hand.
 *
 * ⚠ `pages` is this repo's copy glyph — the sprite has no `copy`.
 */
function CopyIdButton({ id }: { id: string }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

    // The timeout outlives the component if the drawer closes within two seconds of the press.
    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
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
        <button
            data-testid="navigation-menu-copy-id"
            type="button"
            onClick={copy}
            aria-label={t('menu_copy_id')}
            className={cn(
                'relative z-10 flex flex-none cursor-pointer items-center rounded-(--radius-sm) transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                copied ? 'text-(--text-success)' : leftBarProfileCopyClass,
                // 16px of ink in a 24px target, without a 24px line: the pseudo-element takes
                // the pointer area the WCAG 2.5.8 minimum asks for and the layout keeps its
                // 16. Same technique as `ChannelCopyLink`.
                "after:absolute after:-inset-1 after:content-['']",
            )}
        >
            <Icon name={copied ? 'check' : 'pages'} weight="filled" size={16} aria-hidden />
        </button>
    )
}

/**
 * The card's shape while the session is still being resolved — the real geometry, not a grey
 * block: a 48 avatar, a 24-tall name row and a 21-tall meta row, so nothing moves when the
 * answer lands. `docs/DEFINITION_OF_DONE.md` §1.
 */
function MenuProfileCardSkeleton() {
    return (
        <Card type="basic" className="items-center">
            <Skeleton circle w={48} h={48} />
            <LeftBarProfileContent className="gap-1">
                <div className="flex h-[24px] items-center">
                    <Skeleton w={140} />
                </div>
                <div className="flex h-[21px] items-center">
                    <Skeleton w={96} delay={160} />
                </div>
            </LeftBarProfileContent>
        </Card>
    )
}
