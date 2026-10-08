import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import type { NavbarItemState, NavbarItemType } from '@shared/ui/navbar'
import { Navbar, NavbarGroup, NavbarItem, NavbarRule } from '@shared/ui/navbar'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Navbar', robots: { index: false, follow: false } }

const STATES = [
    'default',
    'hover',
    'selected',
    'focus',
    'disabled',
] as const satisfies readonly NavbarItemState[]

/**
 * The DS avatar placeholder: the navbar's avatar box already paints
 * Background/Subtle + Text/Placeholder, so the glyph alone is the placeholder.
 */
const AVATAR_PLACEHOLDER = <Icon name="user-simple-alt" size={16} />

type MatrixRow = {
    type: NavbarItemType
    label: string
    /** Default glyph, and the filled weight Figma swaps in on Selected. */
    glyph: ReactNode
    selectedGlyph: ReactNode
}

/**
 * Every cell's glyph is a literal `<Icon name … weight …>` tag: the sprite build
 * pairs `name` with the `weight` on the same tag, so a glyph assembled from a
 * variable would ship at the default weight only.
 */
const MATRIX: MatrixRow[] = [
    {
        type: 'icon',
        label: 'Icon',
        glyph: <Icon name="house" size={24} />,
        selectedGlyph: <Icon name="house" weight="filled" size={24} />,
    },
    {
        type: 'badge',
        label: 'Badge',
        glyph: <Icon name="bell" size={24} />,
        selectedGlyph: <Icon name="bell" weight="filled" size={24} />,
    },
    {
        type: 'avatar',
        label: 'Avatar',
        glyph: AVATAR_PLACEHOLDER,
        selectedGlyph: AVATAR_PLACEHOLDER,
    },
    {
        type: 'accent',
        label: 'Accent',
        glyph: <Icon name="plus" size={24} />,
        selectedGlyph: <Icon name="plus" weight="filled" size={24} />,
    },
]

/** Dev-only navbar preview: `pnpm dev` then open /dev/navbar. 404s in production. */
export default function NavbarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">Navbar (Web)</h1>
                <p className="type-dense-default text-text-body">
                    Figma 3626:26349 (the rail) + 3626:26304 (item, 5 states × 4 types). The rail
                    below is live — hover it. The matrix pins each Figma variant with{' '}
                    <code className="type-dense-emphasis">state</code> so all twenty render at once.
                </p>
            </header>

            <div className="flex flex-col items-start gap-10 md:flex-row">
                <section className="flex flex-col gap-2">
                    <h2 className="type-micro-overline text-text-body">The rail — 88 × 1008</h2>
                    <div className="flex h-[1008px] rounded-xl border border-(--separator-default)">
                        <Navbar aria-label="Main">
                            <NavbarGroup group="brand">
                                <Logo size={48} />
                                <NavbarRule />
                            </NavbarGroup>

                            <NavbarGroup group="nav">
                                <NavbarItem selected aria-label="Home">
                                    <Icon name="house" weight="filled" size={24} />
                                </NavbarItem>
                                <NavbarItem aria-label="Following">
                                    <Icon name="user-heart-alt" size={24} />
                                </NavbarItem>
                                <NavbarItem aria-label="Chat">
                                    <Icon name="comment-dots" size={24} />
                                </NavbarItem>
                                <NavbarItem type="accent" aria-label="Create">
                                    <Icon name="plus" size={24} />
                                </NavbarItem>
                                <NavbarItem aria-label="Search">
                                    <Icon name="search" size={24} />
                                </NavbarItem>
                                <NavbarItem type="badge" aria-label="Notifications">
                                    <Icon name="bell" size={24} />
                                </NavbarItem>
                                <NavbarItem type="avatar" aria-label="Profile">
                                    {AVATAR_PLACEHOLDER}
                                </NavbarItem>
                            </NavbarGroup>

                            <NavbarGroup group="bottom">
                                <NavbarRule />
                                <NavbarItem aria-label="Menu">
                                    <Icon name="menu-bars" size={24} />
                                </NavbarItem>
                                <NavbarItem aria-label="Language">
                                    <Icon name="language" size={24} />
                                </NavbarItem>
                            </NavbarGroup>
                        </Navbar>
                    </div>
                    <p className="type-caption-meta w-[88px] text-text-body">
                        active: <code>home</code>
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <h2 className="type-micro-overline text-text-body">Item — 5 State × 4 Type</h2>
                    <div className="grid grid-cols-[72px_repeat(5,56px)] items-center gap-4">
                        <span />
                        {STATES.map(state => (
                            <span
                                key={state}
                                className="type-caption-meta capitalize text-text-body"
                            >
                                {state}
                            </span>
                        ))}

                        {MATRIX.map(row => (
                            <div key={row.type} className="col-span-full grid grid-cols-subgrid">
                                <span className="type-caption-meta text-text-body">
                                    {row.label}
                                </span>
                                {STATES.map(state => (
                                    <NavbarItem
                                        key={state}
                                        type={row.type}
                                        state={state}
                                        aria-label={`${row.label} ${state}`}
                                    >
                                        {state === 'selected' ? row.selectedGlyph : row.glyph}
                                    </NavbarItem>
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="type-caption-meta mt-6 flex max-w-[376px] flex-col gap-2 text-text-body">
                        <p>
                            Omit <code>state</code> and the same paints come from{' '}
                            <code>:hover</code>, <code>:focus-visible</code> and{' '}
                            <code>:disabled</code>.
                        </p>
                        <p>
                            <code>accent</code> keeps the Figma axis name but paints from the{' '}
                            <strong>Button/Secondary</strong> ramp, not the Accent one — a bordered
                            square, not a purple button.
                        </p>
                        <p>
                            Selected swaps the glyph to its <code>filled</code> weight — Following
                            and Chat included, since the full library import brought their filled
                            weights.
                        </p>
                    </div>

                    <div className="mt-4 flex flex-col gap-1">
                        <h3 className="type-micro-overline text-text-body">
                            The nine entries are fixed, in this order
                        </h3>
                        <p className="type-caption-meta max-w-[376px] text-text-body">
                            Home · Following · Chat · Create · Search · Notifications · Profile ·
                            Menu · Language
                        </p>
                    </div>
                </section>
            </div>
        </main>
    )
}
