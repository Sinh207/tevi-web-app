'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useState } from 'react'

/**
 * The blue tick, wherever a space's name is written — and, where the caller asks for it, the panel
 * that says what it means.
 *
 * ## The image is the fact, not the object
 *
 * `verified_tick_badge` is an object carrying an **image URL**: the API can hand back bespoke art
 * per programme, so the mark is a CDN asset rather than a DS glyph. The object itself says nothing —
 * the backend sends `{}` (and `{ image: null }`) on an ordinary unverified account, so treating its
 * presence as verification puts a tick on everybody. Gate on `image`, which is what legacy does
 * everywhere (`verified_tick_badge?.image || null`; `BadgeVerifiedTick` returns null without one),
 * and there is deliberately **no sprite fallback**: with no art there is nothing asserting the space
 * is verified, and the sprite has no filled `badge-check` to assert it with.
 *
 * ## Why it lives in `shared/` rather than in `features/channel`
 *
 * Because the same eight lines were written out at eight call sites across **three** features —
 * channel (four rows), search (a row and a grid tile) and membership (a holdings row and the webview
 * order card) — each with its own `alt`, its own size and its own copy of the "gate on the image"
 * comment. A feature may not import another feature, so the only place one definition can serve all
 * of them is here. `ChannelVerifiedMark` stays as the channel feature's thin adapter: it knows the
 * payload shape, this knows what a tick is.
 *
 * ## Decorative by default, a control only when asked
 *
 * `interactive` is opt-in for the same reason `PremiumBadge`'s `href` is: most ticks are drawn
 * *inside* a link — a search result, a following row, a tile — and a `<button>` inside an `<a>` is
 * invalid markup that behaves differently in every browser, quite apart from stealing the press that
 * was meant to open the space. The space header is the one surface whose tick is the reader's own
 * target, so it is the one that opts in.
 *
 * The dialog is loaded only when a badge that can open one is pressed: eight of the nine call sites
 * would otherwise pay for a panel they can never show.
 */

const VerifiedDialog = dynamic(
    () => import('./verified-badge-dialog').then(module => module.VerifiedBadgeDialog),
    { ssr: false },
)

type VerifiedBadgeProps = {
    /** `verified_tick_badge?.image`. Nothing is drawn without it — see above. */
    image: string | null | undefined
    /** 14 in a live card, 16 in a compact row, 24 beside a display name. */
    size?: number
    /** Defaults to `channel_verified` ("Verified"). Pass one to save a `t()` per row in a long list. */
    label?: string
    className?: string
    /**
     * Forwarded to whichever element is outermost — the button, or the image itself.
     *
     * `shared/` **receives** a testid scope and never authors one (`docs/TEST_IDS.md`), and the
     * interactive variant is the outer element, so a caller has no other way to reach it.
     *
     * **The dialog derives its ids from this one** — `-panel`, `-title`, `-close` — rather than
     * taking a second `*TestId` prop: one level of derivation is what the generated catalog
     * resolves, and a prop whose name is not spelled `testId` is invisible to both the linter and
     * the catalog builder.
     */
    'data-testid'?: string
} & (
    | {
          /** Press the tick to open the "what does this mean?" dialog. */
          interactive: true
          /** Where the dialog's **Learn more** goes — `IDENTIFICATION_PATH`, from the caller. */
          learnMoreHref?: string
      }
    | { interactive?: false; learnMoreHref?: undefined }
)

export function VerifiedBadge({
    image,
    size = 24,
    label,
    className,
    'data-testid': testId,
    ...props
}: VerifiedBadgeProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    /*
     * Sticky: the dialog stays mounted once it has been opened, so closing it plays its exit
     * transition instead of vanishing mid-fade. Before the first press it is not in the tree at all,
     * which is what makes the chunk above genuinely lazy.
     */
    const [everOpened, setEverOpened] = useState(false)

    if (!image) return null

    const name = label ?? t('channel_verified')

    /*
     * Decorative and interactive differ in **who carries the name**. As a button the name belongs to
     * the control — an `alt` as well would have a screen reader announce "Verified" twice inside one
     * stop — so the art goes in with an empty `alt`, which is how `next/image` renders a presentational
     * image rather than one with no name at all.
     */
    const art = (
        <Image
            src={image}
            alt={props.interactive ? '' : name}
            width={size}
            height={size}
            className={props.interactive ? 'flex-none' : cn('flex-none', className)}
            /* The declared width/height are attributes; a caller's `size-*` or a stylesheet would
               beat them. Stating the box in `style` is what keeps a 14px tick 14px. */
            style={{ width: size, height: size }}
            data-testid={props.interactive ? undefined : testId}
        />
    )

    if (!props.interactive) return art

    return (
        <>
            <button
                type="button"
                aria-label={name}
                aria-haspopup="dialog"
                data-testid={testId}
                onClick={() => {
                    setEverOpened(true)
                    setOpen(true)
                }}
                className={cn(
                    /*
                     * **The tap target is bigger than the art**, exactly as `PremiumBadge`'s is:
                     * nothing in a name row can grow without pushing the name around, so the target
                     * is an `after:` pseudo-element spilling 6px on every side — 36px of touchable
                     * area out of the 24px box, layout untouched.
                     */
                    'relative inline-flex flex-none cursor-pointer rounded-full',
                    'after:absolute after:-inset-1.5 after:content-[""]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    className,
                )}
            >
                {art}
            </button>

            {everOpened && (
                <VerifiedDialog
                    open={open}
                    onOpenChange={setOpen}
                    image={image}
                    learnMoreHref={props.learnMoreHref}
                    testId={testId}
                />
            )}
        </>
    )
}
