import { BarIconButton } from '@shared/components/bar-icon-button'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Icon, type IconGlyphProps } from '@shared/ui/icon'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'Bar icon button',
    robots: { index: false, follow: false },
}

/**
 * Dev-only comparison of treatments for the sub-page bar's icon buttons: `pnpm dev`, then open
 * /dev/bar-icon-button. 404s in production.
 *
 * Row A is the shipped `BarIconButton`; B is what it drew before 2026-10-07; C and D are drawn locally
 * here and imported by nothing.
 *
 * Each row renders the same bar four times: Light / Dark (via the `.theme-light` / `.dark` token
 * scopes, so both sit side by side regardless of the app theme) × the two grounds a sub-page bar
 * actually lands on — `--background-surface` (below `md`, single-panel screens) and `--background`
 * (the page colour, from `md` up).
 */

type Treatment = 'shipped' | 'previous' | 'floating'

function Candidate({
    treatment,
    label,
    ...glyph
}: IconGlyphProps & { treatment: Exclude<Treatment, 'shipped'>; label: string }) {
    return (
        <Button
            variant="ghost"
            size="large"
            iconOnly
            aria-label={label}
            className={cn(
                'size-10 rounded-full active:scale-[0.95]',
                // What `BarIconButton` drew until 2026-10-07, kept for comparison.
                treatment === 'previous' &&
                    'border border-(--button-secondary-border) bg-(--background-surface) hover:not-disabled:bg-(--background-segment)',
                // Over imagery: a translucent dark disc with a white glyph is legible on any photo,
                // in either theme, because it brings its own ground.
                treatment === 'floating' &&
                    'bg-(--opacity-black-50) text-white backdrop-blur-(--blur-md) hover:not-disabled:bg-(--opacity-black-75)',
            )}
        >
            <Icon {...(glyph as IconGlyphProps)} size={20} className="size-5" />
        </Button>
    )
}

function Bar({
    treatment,
    ground,
    edge = false,
}: {
    treatment: Treatment
    ground: 'surface' | 'page' | 'image'
    edge?: boolean
}) {
    const back =
        treatment === 'shipped' ? (
            <BarIconButton name="angle-left" weight="filled" mirrored label="Back" />
        ) : (
            <Candidate treatment={treatment} name="angle-left" weight="filled" label="Back" />
        )
    const actions =
        treatment === 'shipped' ? (
            <>
                <BarIconButton name="share" label="Share" />
                <BarIconButton name="more-horizontal" label="More" />
            </>
        ) : (
            <>
                <Candidate treatment={treatment} name="share" label="Share" />
                <Candidate treatment={treatment} name="more-horizontal" label="More" />
            </>
        )

    return (
        <AppBar
            className={cn(
                ground === 'surface' && 'bg-(--background-surface)',
                ground === 'page' && 'bg-(--background)',
                // A stand-in for a channel cover: no remote art on dev pages either.
                ground === 'image' &&
                    'h-[120px] items-start bg-[linear-gradient(135deg,#f6d365_0%,#fda085_40%,#5b6cff_100%)]',
                edge && 'border-b border-(--separator-default)',
            )}
        >
            <AppBarCluster>{back}</AppBarCluster>
            {ground !== 'image' ? (
                <AppBarTitle className="max-w-[calc(100%-200px)]">
                    <AppBarTitleText className="max-w-full truncate">
                        Transaction history
                    </AppBarTitleText>
                </AppBarTitle>
            ) : null}
            <AppBarCluster>{actions}</AppBarCluster>
        </AppBar>
    )
}

function Cell({
    theme,
    title,
    children,
}: {
    theme: 'light' | 'dark'
    title: string
    children: ReactNode
}) {
    return (
        <div
            className={cn(
                theme === 'light' ? 'theme-light' : 'dark',
                'flex flex-col gap-2 rounded-[var(--radius-lg)] bg-(--background) p-3 text-(--text-title)',
                // These tokens are declared on `:root` as `var(--zinc-…)`, so they resolve there — in the
                // app's theme — and inherit as finished colours; a `.dark` scope on a <div> never
                // re-resolves them. In the app `.dark` sits on <html> itself, so this is a preview-only
                // gap: re-declare the chain where the scope begins.
                '[--separator-default:var(--zinc-200)] [--separator-strong:var(--zinc-300)]',
                '[--button-secondary-border:var(--separator-strong)] [--button-ghost-bg-hover:var(--zinc-200)]',
                '[--button-ghost-text:var(--text-title)]',
            )}
        >
            <span className="type-micro-overline text-(--text-body)">{title}</span>
            <div className="overflow-clip rounded-[var(--radius-md)]">{children}</div>
        </div>
    )
}

function Row({
    id,
    heading,
    note,
    treatment,
    edge,
    grounds = ['surface', 'page'],
}: {
    id: string
    heading: string
    note: string
    treatment: Treatment
    edge?: boolean
    grounds?: ('surface' | 'page' | 'image')[]
}) {
    return (
        <section className="flex flex-col gap-3">
            <header className="flex flex-col gap-1">
                <h2 className="type-title-t3-semibold text-(--text-title)">
                    {id}. {heading}
                </h2>
                <p className="type-dense-default max-w-[720px] text-(--text-body)">{note}</p>
            </header>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(['light', 'dark'] as const).flatMap(theme =>
                    grounds.map(ground => (
                        <Cell
                            key={`${theme}-${ground}`}
                            theme={theme}
                            title={`${theme} · ${ground}`}
                        >
                            <Bar treatment={treatment} ground={ground} edge={edge} />
                            {ground !== 'image' ? (
                                <div
                                    className={cn(
                                        'h-16',
                                        ground === 'surface'
                                            ? 'bg-(--background-surface)'
                                            : 'bg-(--background)',
                                    )}
                                />
                            ) : null}
                        </Cell>
                    )),
                )}
            </div>
        </section>
    )
}

export default function DevBarIconButtonPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Bar icon button</h1>
                <p className="type-dense-default max-w-[720px] text-(--text-body)">
                    Sub-page bar controls (back · share · ⋯), compared on both grounds and both
                    themes. A is shipped; B is the previous treatment; C–D are drawn on this page
                    only. Hover a button to see its disc.
                </p>
            </header>

            <Row
                id="A"
                heading="Shipped — ghost: 24 glyph in a 40 target, disc on hover/press only"
                note="BarIconButton as it is today. The bar is the ground, so the control carries no fill or edge at rest."
                treatment="shipped"
            />
            <Row
                id="B"
                heading="Previous — 40 surface disc + 1px border"
                note="What shipped until 2026-10-07. The border existed only because the surface disc vanished on a surface bar."
                treatment="previous"
            />
            <Row
                id="C"
                heading="A + scroll edge on the bar"
                note="Not shipped: a hairline under the bar, which in the app would appear only once content has scrolled under it."
                treatment="shipped"
                edge
            />
            <Row
                id="D"
                heading="Over artwork — a plate the caller supplies"
                note="Not shipped as drawn: no sub-page bar sits over a photo today. Premium's band uses its own glass (PREMIUM_CONTROL_ON_HERO); this is the shape a future cover bar would take."
                treatment="floating"
                grounds={['image']}
            />
        </main>
    )
}
