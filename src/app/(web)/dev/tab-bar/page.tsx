import { Icon } from '@shared/ui/icon'
import { TabBar, TabBarFab, TabBarItem, TabBarProfile } from '@shared/ui/tab-bar'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Tab Bar', robots: { index: false, follow: false } }

/**
 * The DS avatar placeholder: the profile circle already paints Background/Subtle +
 * Text/Placeholder, so the glyph alone is the placeholder.
 */
const AVATAR_PLACEHOLDER = <Icon name="user-simple-alt" size={16} />

/** Dev-only tab bar preview: `pnpm dev` then open /dev/tab-bar. 404s in production. */
export default function TabBarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">Tab Bar</h1>
                <p className="type-dense-default text-text-body">
                    Figma 159:4989 (the bar) + 122:28626 / 122:28652 / 122:28683 (item, FAB item,
                    profile item — Selected No/Yes each). The bar is a fixed composition, not a
                    slot.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    Tab Bar 159:4989 — the shipped composition, 402 wide
                </h2>
                <div className="w-[402px] bg-(--background-surface)">
                    <TabBar aria-label="Main">
                        <TabBarItem
                            selected
                            knockout
                            label="Home"
                            icon={<Icon name="house-heart" weight="duotone" size={24} />}
                        />
                        <TabBarItem
                            label="Following"
                            icon={<Icon name="user-heart-alt" weight="duotone" size={24} />}
                        />
                        <TabBarFab aria-label="Video" />
                        <TabBarItem
                            knockout
                            label="Messages"
                            icon={<Icon name="comment-dots" weight="duotone" size={24} />}
                        />
                        <TabBarProfile label="My Space">{AVATAR_PLACEHOLDER}</TabBarProfile>
                    </TabBar>
                </div>
                <p className="type-caption-meta text-text-body">
                    active: <code>home</code> — the four left entries share the width equally (82.5)
                    and My Space is pinned at 72. 4 × 82.5 + 72 = 402.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    Tab Bar/Item 122:28626 — Selected=No / Yes (the set ships plain{' '}
                    <code>house</code>, not the duotone the bar uses)
                </h2>
                <div className="flex w-[144px] bg-(--background-surface)">
                    <TabBarItem label="Label" icon={<Icon name="house" size={24} />} />
                    <TabBarItem selected label="Label" icon={<Icon name="house" size={24} />} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    Tab Bar/FAB Item 122:28652 — Selected=No / Yes are pixel-identical
                </h2>
                <div className="flex w-[144px] bg-(--background-surface)">
                    <TabBarFab aria-label="Video" />
                    <TabBarFab aria-label="Video" />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    Tab Bar/Profile Item 122:28683 — Selected=No / Yes
                </h2>
                <div className="flex w-[144px] bg-(--background-surface)">
                    <TabBarProfile label="My Space">{AVATAR_PLACEHOLDER}</TabBarProfile>
                    <TabBarProfile selected label="My Space">
                        {AVATAR_PLACEHOLDER}
                    </TabBarProfile>
                </div>
            </section>

            <div className="type-caption-meta flex max-w-[440px] flex-col gap-2 text-text-body">
                <p>
                    The duotone glyphs run at full tint here with the detail layer knocked out to
                    White — a <code>&lt;use&gt;</code> clone sits in a shadow tree no selector can
                    reach, so it goes through <code>--tevi-icon-tint</code> /{' '}
                    <code>--tevi-icon-detail</code>. <code>user-heart-alt</code> keeps every path on
                    one colour, so Following is not knocked out.
                </p>
                <p>
                    The bar carries a raw 20px background blur (not <code>--blur-sm/md/lg</code>),
                    so it is meant to overlay content — put it in a fixed host, as{' '}
                    <code>(main)/layout.tsx</code> does.
                </p>
            </div>
        </main>
    )
}
