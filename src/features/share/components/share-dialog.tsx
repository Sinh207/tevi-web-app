'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useShareLink } from '../hooks/use-share-link'
import { type ShareChannel, visibleShareChannels } from '../lib/share-channels'
import type { ShareContext } from '../lib/share-context'
import { useShareInMessage } from '../lib/share-in-message'
import { MessengerMark } from './brand-marks'
import { ShareQrPanel } from './share-qr-panel'

/**
 * "Share to" — the sheet legacy opens from a space, a post, a mini app and four settings menus.
 *
 * **A 1:1 port of `components/share/` in `../tevi-web-app`**, geometry included: a 512 popup, a 56px
 * header band, a preview card inset 16 with a 64px thumbnail flush to its edge, a 4px slab between
 * blocks, and one horizontal row of 48px discs with 12px labels under them. Where a number below
 * looks arbitrary it is legacy's, and the token beside it is this app's nearest equivalent rather
 * than a redesign.
 *
 * ## No responsive modal, and that is the one structural change
 *
 * Legacy's `<Share>` is a `ResponsiveModal`: a centred MUI `Dialog` from md up and a bottom `Drawer`
 * below it, chosen by a JS media query. That component is not being ported — this app has no bottom
 * sheet and the design system draws none, so a dialog is what every legacy full-screen has become
 * here. Nothing inside changes: the popup already fills the width it is given on a phone
 * (`max-w-[calc(100vw-2rem)]`) and its own `max-h` bounds what the drawer's scroll bounded.
 *
 * ## The header is the app's, not legacy's — the one place the comps lose
 *
 * Legacy's band ranges the title left and puts an ✕ at the **trailing** edge. `docs/DESIGN_SYSTEM.md`
 * §7 says a dialog with a 56px title band is a *screen* and its dismiss goes at the **leading** edge,
 * and that rule carries an explicit ⚠ about comps that disagree: `NsfwAppealDialog` drew the ✕
 * trailing in Figma and was moved, because eight dialogs teaching one place to look is worth more
 * than any one of them matching its mock. So this uses `DialogScreenHeader` like the other eight.
 *
 * The QR step is what makes it structural rather than deference: that slot carries `xmark` at the
 * root and `angle-left` behind it. Legacy opens the QR as a **whole second modal** over the sheet,
 * whose ✕ dismisses it and leaves you back on the rows; here it is a step in the same popup with a
 * back arrow — the same press, minus a second scrim over the first and a second thing to dismiss.
 *
 * ## The middle third comes from `features/message`, through a slot
 *
 * Legacy's sheet has three blocks: the link preview, **"Send in message"** (the reader's DM
 * conversations as a swipeable row, with a message box and a fan-out send), and "Share to". The
 * middle one is a messenger screen, and this feature cannot import the messenger feature without
 * closing a barrel cycle — `lib/share-in-message.tsx` says which, and how `app/` hands the block in.
 * The sheet owns where it goes (between the preview and the channel row, with a second 4px slab),
 * the link it sends (minted on `internal`) and the step its "More" opens; the block owns everything
 * about conversations.
 *
 * That step is legacy's **second modal** ("Send to", with the search) turned into a step of this
 * one, like the QR code: same popup, `angle-left` back to the rows. The block stays mounted across
 * the switch, so what was picked in the row is still picked in the search — legacy shares one
 * selection between its two modals for the same reason.
 *
 * The block renders nothing for a guest, so — unlike legacy, which wraps its share button in
 * `RequireAuth` — **a guest can still share.** A visitor always carries an anonymous session, so the
 * mint is authorised either way, and gating a press that only hands over a URL would be a sign-in
 * dialog for nothing; what a guest loses is the one block that needs an inbox.
 *
 * ## The row scrolls, with legacy's arrows and without its carousel
 *
 * This is a **scrolling row**, not a carousel — `docs/DESIGN_SYSTEM.md` §10 has the distinction and
 * why Embla is deliberately not used for one.
 *
 * Legacy runs a Swiper here (`slidesPerView` 5 below 900, 6 above, `spaceBetween: 16`) with prev/next
 * discs over it. Seven rows at those same measurements are 544px against the 512 popup's 480, so the
 * row really does overflow and the arrows really are needed — they are ported, in `ChannelRow`,
 * which is also where the reasons for not porting Swiper with them are written. The eighth row
 * legacy has and this does not is **WhatsApp**; `lib/share-channels.ts` says what it is waiting on,
 * and it drops into the same row.
 */
export function ShareDialog({
    open,
    onOpenChange,
    url,
    title,
    image,
    context,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /**
     * The content's own public URL — `shareable_url` from whatever payload raised this. Every link
     * the sheet hands out is minted **from** it, and it is what each row falls back to when the link
     * service will not answer.
     */
    url: string
    /** What is being shared, for the preview card. */
    title?: string | null
    /** The preview thumbnail — a backend URL (an avatar, a post's cover). */
    image?: string | null
    /**
     * Names the content so the link can be attributed and tracked per channel. Omit it and every
     * row shares one plain short link instead; `lib/share-context.ts` argues why that is a state
     * rather than a degradation.
     */
    context?: ShareContext | null
}) {
    const { t } = useTranslation()
    const [step, setStep] = useState<'share' | 'qr' | 'message'>('share')
    const [qrUrl, setQrUrl] = useState<string>()
    const SendInMessage = useShareInMessage()
    const { shareUrl, copyLink, qrLink, messageLink, openChannel } = useShareLink({
        url,
        context,
        enabled: open,
    })

    function close(next: boolean) {
        onOpenChange(next)
        // Reset on the way out rather than on the way in: a sheet that reopens on the QR step is
        // confusing, and resetting on open would flash the root step over a step being left.
        if (!next) setStep('share')
    }

    function press(channel: ShareChannel) {
        if (channel === 'copy-link') {
            void copyLink()
            return
        }
        if (channel === 'qr-code') {
            setStep('qr')
            // Usually already in the query cache (a share with no context shares one link across
            // every row), so this resolves in the same tick and the panel never draws its skeleton.
            void qrLink().then(setQrUrl)
            return
        }
        void openChannel(channel)
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            {/*
             * 512, which is legacy's `maxWidth` — not the DS dialog's 370.
             *
             * It does not make the channel row fit, and nothing would: legacy runs that row on a
             * Swiper (`freeMode`, six slides per view at ≥900 and five below) over eight buttons, so
             * it scrolls at every width it has ever shipped at. 512 is what keeps the *preview*
             * whole — a 64px thumbnail plus a full short link on one line — and what puts six of the
             * seven discs on screen, which is legacy's own desktop count. `ChannelRow` below owns
             * the seventh and the arrows that reach it.
             */}
            <DialogContent
                data-testid="share-sheet"
                /*
                 * The **surface** fill rather than the DS dialog's `--background-subtle`, because
                 * legacy layers three tones and the middle one is what carries its structure: a
                 * white sheet, a white preview card lifted off it by a shadow, and a grey 4px slab
                 * marking where one block ends and the next begins. On a subtle-grey sheet the slab
                 * is the same tone as the ground it sits on — the break disappears and the card
                 * stops reading as raised.
                 */
                className="w-[512px] gap-0 bg-(--background-surface) p-0"
            >
                <DialogScreenHeader
                    title={
                        step === 'qr'
                            ? t('share_qr_title')
                            : step === 'message'
                              ? t('share_send_to')
                              : t('share_title')
                    }
                    // The same slot carries `angle-left` at the QR and Send-to steps, which is the
                    // whole reason §7 puts it at the leading edge.
                    onBack={step === 'share' ? undefined : () => setStep('share')}
                    testId="share-sheet-header"
                />

                {step === 'qr' && (
                    <ShareQrPanel
                        url={qrUrl}
                        onCopy={() => void copyLink()}
                        testId="share-qr-code"
                    />
                )}
                {step === 'share' && (
                    <>
                        <SharePreview title={title} image={image} url={shareUrl} />
                        {/*
                         * The 4px slab legacy sets between every block (`Divider borderWidth: 4px`,
                         * `#F4F4F4`) — a section break rather than a rule, which is why it is a band
                         * of the segment fill and not `--separator-default`.
                         */}
                        <ShareSlab />
                    </>
                )}
                {/*
                 * Mounted at every step, and in one place in the tree, so the selection inside it
                 * survives the trip to the picker and to the QR code and back. Hidden rather than
                 * unmounted at the QR step for that reason. The block draws its own trailing slab:
                 * it is the one that knows whether it drew anything at all (a guest, an empty inbox).
                 */}
                {SendInMessage && (
                    <div data-testid="share-dm" className={step === 'qr' ? 'hidden' : 'contents'}>
                        <SendInMessage
                            view={step === 'message' ? 'picker' : 'row'}
                            onExpand={() => setStep('message')}
                            resolveLink={messageLink}
                            onSent={() => close(false)}
                            testScope="share-dm"
                        />
                    </div>
                )}
                {step === 'share' && (
                    <div className="flex flex-col gap-3 p-4">
                        <h3 className="type-dense-strong m-0 text-(--text-title)">
                            {t('share_title')}
                        </h3>
                        <ChannelRow>
                            {visibleShareChannels().map(spec => (
                                <button
                                    key={spec.id}
                                    type="button"
                                    data-testid="share-channel"
                                    // Identity in a companion attribute, never in the id —
                                    // `shared/lib/test-id.ts` says why.
                                    data-option-value={spec.id}
                                    onClick={() => press(spec.id)}
                                    className={cn(
                                        'flex w-16 flex-none snap-start cursor-pointer flex-col items-center gap-1',
                                        'rounded-(--radius-md) border-0 bg-transparent p-0',
                                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex size-12 items-center justify-center rounded-full',
                                            /*
                                             * `transition-[opacity,scale]`, not
                                             * `transition-transform`: Tailwind v4 writes
                                             * `scale-*` to the **`scale` property**, so naming
                                             * `transform` here would animate nothing and the
                                             * press would snap.
                                             */
                                            'transition-[opacity,scale] duration-150',
                                            'hover:opacity-85 active:scale-95 motion-reduce:transition-none',
                                            /*
                                             * A sprite brand mark **is** the disc: a badge
                                             * painted in the brand colour with the logo knocked
                                             * out (`brandHooks` in `build-icon-sprite.mjs`). So the
                                             * disc is only the paper behind the knockout — white,
                                             * or black for X's inverse lockup — and the badge is
                                             * scaled to cover it (below). Drawing the badge *on* a
                                             * brand disc is how it shipped: a grey badge inside a
                                             * blue ring.
                                             */
                                            spec.brand && 'overflow-clip bg-white',
                                            spec.brand && spec.invertInDark && 'dark:bg-black',
                                            // Messenger's disc is a gradient, i.e. a
                                            // `background-image`.
                                            spec.brandGradient &&
                                                'bg-[image:var(--share-disc)] text-white',
                                            !spec.brand &&
                                                !spec.brandGradient &&
                                                'bg-(--background-segment) text-(--icon-default)',
                                        )}
                                        /*
                                         * The inline value is a **custom property**, not the
                                         * `background-color` itself, so a class can still win in
                                         * dark mode — an inline declaration beats any class, and
                                         * X's disc has to invert (`lib/share-channels.ts`).
                                         *
                                         * It is inline at all because the value is another
                                         * company's brand colour rather than a token; the same
                                         * table argues that. A Tailwind arbitrary value would put
                                         * the hex in the class string, which is what `pnpm lint`
                                         * and a DS review look for.
                                         */
                                        style={
                                            spec.brand || spec.brandGradient
                                                ? ({
                                                      '--share-disc':
                                                          spec.brandGradient ?? spec.brand,
                                                  } as CSSProperties)
                                                : undefined
                                        }
                                    >
                                        {/* The one logo the DS sprite has no glyph for —
                                                `components/brand-marks.tsx` says why it may live
                                                outside the sprite. */}
                                        {spec.glyph === 'messenger-mark' ? (
                                            <MessengerMark />
                                        ) : spec.brand ? (
                                            /*
                                             * The badge spans 19.2 of the glyph's 24 units, so
                                             * 60px fills the 48px disc exactly; 62 overshoots by
                                             * under a pixel a side, which is what keeps a hairline
                                             * of white paper from showing at the antialiased edge.
                                             * The disc's clip trims X's rounded square to the
                                             * same circle as its neighbours.
                                             */
                                            <Icon
                                                name={spec.glyph}
                                                aria-hidden
                                                className={cn(
                                                    'size-[62px] flex-none [--tevi-icon-brand:var(--share-disc)]',
                                                    spec.invertInDark &&
                                                        'dark:[--tevi-icon-brand:white]',
                                                )}
                                            />
                                        ) : (
                                            <Icon name={spec.glyph} size={24} aria-hidden />
                                        )}
                                    </span>
                                    {/*
                                     * Wraps rather than truncates, which is legacy's behaviour
                                     * and the right one in nine locales: "Copy link" is "Sao
                                     * chép liên kết", and a 64px column truncates it to nothing
                                     * useful. `items-start` above keeps the discs on one line
                                     * while the labels under them run to different heights.
                                     */}
                                    <span className="type-caption-meta text-center text-(--text-subtitle)">
                                        {t(spec.labelKey)}
                                    </span>
                                </button>
                            ))}
                        </ChannelRow>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}

/** The 4px band between two blocks — see where the preview's one is drawn. */
function ShareSlab() {
    return <div className="h-1 flex-none bg-(--background-segment)" aria-hidden />
}

/**
 * The row of discs — one line that scrolls, with prev/next revealed on hover.
 *
 * This is a **scrolling row**, not a carousel — `docs/DESIGN_SYSTEM.md` §10 has the distinction and
 * why Embla is deliberately not used for one.
 *
 * ## Why the arrows hide, and what that fixed
 *
 * Seven rows at legacy's measurements (64 wide, 16 apart) are 544px against the 512 popup's 480, so
 * the row overflows and a pointer has no gesture to scroll it with — which is why legacy paints
 * prev/next discs here and why they are ported.
 *
 * They were **always visible** for three iterations, and every one of them spent real space on
 * them: an arrow standing on the row needs the item behind it hidden, hiding an item means masking
 * a whole column, and a 104px pocket holding a 36px control reads as a layout mistake — worse than
 * the problem it solved. Measured: a quarter of the row, on a dialog whose whole job is to show
 * seven icons.
 *
 * So they behave the way every dense scrolling shelf on the web behaves: **absent until the pointer
 * is on the row**, then over the content, with a shadow that says they are on top of it rather than
 * part of it. Nothing is reserved, so nothing is wasted — the row is seven columns wide at every
 * width, and the arrows cost zero of it.
 *
 * Three details that keep that from being a regression:
 *
 * - **`group-focus-within` as well as `group-hover`.** Hover-only controls are invisible to a
 *   keyboard, and this row is seven buttons — tabbing into it must not tab into something that
 *   cannot be seen.
 * - **Touch gets none of them, deliberately.** There is no hover on a phone, and a swipe is the
 *   gesture people already have there; the edge fade is what says there is more. This is the one
 *   place where "invisible to most of the people it is for" is the *right* answer, and the opposite
 *   of the rule `channel-copy-link.tsx` states — the difference is that this affordance has a
 *   native substitute and a copy glyph does not.
 * - **`inert` at the end it points at**, so hovering never reveals a control that would do nothing.
 *
 * ⚠ **A suite driving `share-channels-prev` / `-next` has to move the pointer onto the row first.**
 * They are `pointer-events: none` until then — which is what stops an invisible disc from swallowing
 * a press meant for the icon underneath — so a bare `click()` on one resolves the element, waits for
 * it to be actionable, and times out with "the row intercepts pointer events". `hover()` a channel,
 * then press. (`docs/TEST_IDS.md` catalogues both ids; this is the note that goes with them.)
 *
 * ## The edges are a mask, and now only a hint
 *
 * `mask-image` on the scroller rather than a scrim painted over it: the items dissolve, so there is
 * nothing to colour-match, no seam, and the row works on any surface (a scrim is what forced this
 * sheet to override the DS dialog's own fill). It is written as an inline style for the reason
 * `shared/ui/left-bar.tsx` gives at `FEATURED_RING` — mask values do not survive Tailwind's
 * arbitrary-value escaping, and the failure is silent.
 *
 * The fade is **24px**, down from the 104 it took to hide a column under an arrow. At that width it
 * does one job — softening the cut so the row reads as continuing rather than ending — and it can
 * no longer be the thing that eats the layout. What a scroll boundary looks like mid-item is what
 * every shelf looks like; what looked broken before was a half-dissolved disc sitting *beside* an
 * opaque control in an empty pocket, and there is no pocket now.
 *
 * ## RTL
 *
 * `scrollLeft` is signed differently across engines under `dir="rtl"` — Chrome reports 0 at the
 * *right* edge and counts negative going left. So the ends are measured on `Math.abs(scrollLeft)`,
 * which is direction-agnostic, and "forward" is decided by the computed direction rather than by
 * the sign. The mask is the one thing that has to be physical (a gradient has no logical axis), so
 * `measure` maps the two logical ends onto left/right itself.
 */
function ChannelRow({ children }: { children: ReactNode }) {
    const { t, currentLanguage } = useTranslation()
    const scroller = useRef<HTMLDivElement>(null)
    const [ends, setEnds] = useState({ atStart: true, atEnd: true })
    /** Which physical edge carries the fade. Physical, because a gradient has no logical axis. */
    const [fade, setFade] = useState({ left: false, right: false })

    /**
     * Whether either end is reached, from the element rather than from a running total — a scroll
     * position can be changed by a drag, a wheel, a snap, or a keyboard, and only one of those is
     * this component's own doing.
     */
    // `useCallback` because the resize observer below takes it as a dependency; it reads only refs
    // and setters, so an empty list is the honest one.
    const measure = useCallback(() => {
        const el = scroller.current
        if (!el) return
        const offset = Math.abs(el.scrollLeft)
        const max = el.scrollWidth - el.clientWidth
        // 1px of slack: a fractional layout width leaves `max` a hair above the last reachable
        // position, which would keep the next arrow lit with nothing left to reveal.
        const atStart = offset <= 1
        const atEnd = offset >= max - 1
        setEnds({ atStart, atEnd })

        const rtl = getComputedStyle(el).direction === 'rtl'
        setFade({
            left: !(rtl ? atEnd : atStart),
            right: !(rtl ? atStart : atEnd),
        })
    }, [])

    /*
     * Measured after mount and on every resize, never assumed: whether this row overflows at all
     * depends on how wide its labels are, which depends on the locale — "Copy link" is "Sao chép
     * liên kết" — and on a popup that is 512 on a desktop and 358 on a phone.
     *
     * `currentLanguage` is a **trigger**, not a value: switching to `ar` flips `<html dir>` without
     * resizing or scrolling anything, so neither the observer nor the scroll handler would fire —
     * and the mask's two sides are physical, so they would stay swapped until the reader next
     * touched the row. (The suppression has to be the last comment line before the call, or it
     * attaches to a comment and is reported unused.)
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `currentLanguage` is a trigger — see above
    useEffect(() => {
        const el = scroller.current
        if (!el) return
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        return () => observer.disconnect()
    }, [measure, currentLanguage])

    /** One page = as many whole discs as fit, so nothing is ever left cut at the fold. */
    function page(forward: boolean) {
        const el = scroller.current
        if (!el) return
        const first = el.firstElementChild as HTMLElement | null
        const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0
        const stride = (first?.offsetWidth ?? 64) + gap
        const perPage = Math.max(1, Math.floor(el.clientWidth / stride))
        const rtl = getComputedStyle(el).direction === 'rtl'
        el.scrollBy({
            left: stride * perPage * (forward ? 1 : -1) * (rtl ? -1 : 1),
            behavior: 'smooth',
        })
    }

    return (
        /*
         * `group` is what the arrows watch. The bleed is here rather than on the scroller so both
         * the mask and the arrows are measured against the same box; `px-4` on the scroller keeps
         * the first and last disc lined up with the heading above them.
         */
        <div className="group -mx-4 relative">
            {/*
             * `overscroll-x-contain` keeps a horizontal swipe from turning into the browser's back
             * gesture once the row runs out of scroll.
             */}
            <div
                ref={scroller}
                onScroll={measure}
                style={maskStyle(fade)}
                className={cn(
                    'flex snap-x scroll-px-4 items-start gap-4 px-4',
                    'overflow-x-auto overscroll-x-contain',
                    // The scrollbar is chrome the design does not draw, and under a 64px column it
                    // would eat the label. Same idiom as `legal-toc.tsx`.
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                )}
            >
                {children}
            </div>
            <ChannelRowArrow
                side="start"
                spent={ends.atStart}
                testId="share-channels-prev"
                label={t('share_channels_prev')}
                onClick={() => page(false)}
            />
            <ChannelRowArrow
                side="end"
                spent={ends.atEnd}
                testId="share-channels-next"
                label={t('share_channels_next')}
                onClick={() => page(true)}
            />
        </div>
    )
}

/** The soft edge, in px. A hint that the row continues — not a hiding place for a control. */
const FADE_PX = 24

/**
 * The mask that softens whichever end still has something behind it.
 *
 * `WebkitMaskImage` alongside the standard property, because Safari only unprefixed `mask-image` in
 * 15.4 and this app supports further back than that. Both, or neither — a mask that applies in one
 * engine and not the other is a row that fades on a Mac and clips on an iPhone.
 */
function maskStyle({ left, right }: { left: boolean; right: boolean }) {
    if (!left && !right) return undefined
    const image = `linear-gradient(to right, transparent 0, #000 ${left ? FADE_PX : 0}px, #000 calc(100% - ${
        right ? FADE_PX : 0
    }px), transparent 100%)`
    return { maskImage: image, WebkitMaskImage: image } as CSSProperties
}

/**
 * One end's arrow — legacy's disc, at 36px, revealed by the row's hover or focus.
 *
 * `--background-elevated` is the fill: white in Light, `#222225` in Dark, the token for something
 * floating *over* a surface (it is what `--popover` is built on). `--background-surface` was wrong
 * and silently so — in Dark that **is** the sheet, so the disc disappeared into it and all that was
 * left of the control was a 1px ring. The shadow does the lifting in Light; the ring returns in Dark,
 * where a near-black shadow on near-black lifts nothing.
 *
 * `inert` when the row is already at this end: the control keeps its place, so nothing reflows, and
 * `inert` takes it out of the tab order and out of the hover reveal rather than leaving a button that
 * can be pressed while invisible.
 *
 * `top-[35%]` is legacy's own number and it is right for the reason its author probably did not
 * write down: this row is a 48px disc over a two-line label, so the *optical* centre is the disc, not
 * the row. Centring on the row would put the arrow through the text.
 */
function ChannelRowArrow({
    side,
    spent,
    testId,
    label,
    onClick,
}: {
    side: 'start' | 'end'
    /** The row is already at this end — nothing for this control to reveal. */
    spent: boolean
    testId: string
    label: string
    onClick: () => void
}) {
    return (
        <button
            inert={spent || undefined}
            data-testid={testId}
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
                'absolute top-[35%] flex size-9 -translate-y-1/2 items-center justify-center',
                // Flush with the row's own padding, so it sits over the first (or last) disc rather
                // than in a reserved gutter. Nothing is reserved.
                side === 'start' ? 'start-1' : 'end-1',
                'cursor-pointer rounded-full border-0 dark:border dark:border-(--separator-default)',
                'bg-(--background-elevated) text-(--icon-default) shadow-lg',
                'transition-[opacity,background-color] duration-150',
                'hover:bg-(--background-segment) dark:hover:bg-(--background-segment-focus)',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                /*
                 * Hidden until the pointer is on the row or focus is inside it. `pointer-events-none`
                 * with it, so an invisible disc never swallows a press meant for the disc underneath
                 * — the failure that makes hover-revealed controls feel broken.
                 */
                'pointer-events-none opacity-0',
                'group-hover:pointer-events-auto group-hover:opacity-100',
                'group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                spent && 'group-hover:opacity-0 group-focus-within:opacity-0',
            )}
        >
            {/* A chevron is one of the few marks whose meaning *is* its direction. */}
            <Icon
                name={side === 'start' ? 'angle-left' : 'angle-right'}
                size={16}
                className="rtl:rotate-180"
                aria-hidden
            />
        </button>
    )
}

/**
 * What is about to be shared — a 64px thumbnail flush to the card's edge, the name, and the link.
 *
 * Legacy's own geometry: inset 16 from the sheet, `--radius-lg`, a soft shadow rather than a border,
 * `overflow` clipped so the image squares off the leading corners, 10px to the text and 10px of
 * vertical padding on the text alone. The shadow is `shadow-sm` here because the DS ramp is what
 * this app has; legacy writes `0 0 10px rgba(0,0,0,0.1)`.
 *
 * The link is the part that earns the block: it is the *short* URL, so the reader can see what will
 * land in the conversation before they send it anywhere, and it is on screen because it had to be
 * minted eagerly anyway (`use-share-link.ts` explains the clipboard gesture that forces that).
 * While the mint is in flight the line is a skeleton — legacy leaves it blank and the card jumps a
 * line taller when the URL lands.
 *
 * A missing thumbnail collapses the slot instead of drawing a placeholder square: legacy falls back
 * to *the signed-in reader's own* channel thumb (`myChannel.images.thumb`), which is how a shared
 * post ends up previewed with the sharer's face. Nothing is a better fallback than the wrong thing.
 *
 * That refusal has a cost, and it is the caller's to pay. Legacy leans on the fallback at three of
 * its own call sites — the two monetization settings menus and the DM setting pass no `image` at
 * all — and there the fallback is *right*, because the sharer owns the thing being shared. Dropping
 * it silently drops the picture, which is a banner with a hole in it rather than a visible bug. So
 * every caller here passes `image` explicitly, the two menus passing `myChannel.images.thumb`
 * themselves; a new one that can name its content must do the same.
 */
function SharePreview({
    title,
    image,
    url,
}: {
    title?: string | null
    image?: string | null
    url?: string
}) {
    return (
        <div
            data-testid="share-preview"
            className={cn(
                'm-4 flex items-start gap-2.5 overflow-clip rounded-(--radius-lg)',
                'bg-(--background-surface) shadow-sm',
            )}
        >
            {image ? (
                <Image
                    src={image}
                    alt=""
                    width={64}
                    height={64}
                    className="size-16 flex-none object-cover"
                />
            ) : null}
            <div className={cn('flex min-w-0 flex-col gap-1 py-2.5', image ? 'pe-2.5' : 'px-2.5')}>
                {title ? (
                    <p className="type-dense-strong m-0 truncate text-(--text-title)">{title}</p>
                ) : null}
                {url ? (
                    <p className="type-caption-meta m-0 truncate text-(--text-subtitle)">{url}</p>
                ) : (
                    /*
                     * `w`/`h` **props**, not classes: `Skeleton` writes its height as an inline
                     * style (the DS's 12px bar by default) and an inline declaration beats any
                     * class, so `h-4` here would silently draw a 12px bar and the card would grow
                     * when the URL landed. Its own docstring is where that trap is written down.
                     */
                    <Skeleton w={192} h={16} className="rounded-(--radius-sm)" />
                )}
            </div>
        </div>
    )
}
