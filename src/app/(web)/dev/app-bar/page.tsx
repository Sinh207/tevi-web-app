import { AppTopBar } from '@features/navigation'
import {
    AppBar,
    AppBarButton,
    AppBarButtonIcon,
    AppBarButtonLabel,
    AppBarStarBalance,
    AppBarStarCount,
    AppBarStarIcon,
    AppBarStarPlus,
    AppBarSubtitle,
    AppBarTitle,
    AppBarTitleText,
} from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'App Bar', robots: { index: false, follow: false } }

/** Dev-only App Bar preview: `pnpm dev` then open /dev/app-bar. 404s in production. */
export default function AppBarPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">App Bar</h1>
                <p className="type-dense-default text-text-body">
                    Figma 34:7033 plus App Bar/Button 34:6891, Star Balance 2274:48365, Star Icon
                    2022:5662 and Badge 3464:21037. The bar has no background of its own — every
                    frame below supplies one.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    The home arrangement — what the app ships on mobile
                </h2>
                <div className="w-[414px] max-w-full bg-(--background) outline outline-(--separator-default)">
                    <AppTopBar />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">Button — types and themes</h2>
                <div className="flex flex-wrap items-center gap-3 bg-(--background) p-3 outline outline-(--separator-default)">
                    <AppBarButton aria-label="1-icon">
                        <AppBarButtonIcon>
                            <Icon name="search" size={22} />
                        </AppBarButtonIcon>
                    </AppBarButton>
                    <AppBarButton type="1-icon-active" aria-label="1-icon-active">
                        <AppBarButtonIcon>
                            <Icon name="check" size={22} />
                        </AppBarButtonIcon>
                    </AppBarButton>
                    <AppBarButton type="3-icons" aria-label="3-icons">
                        <AppBarButtonIcon>
                            <Icon name="bell" size={22} />
                        </AppBarButtonIcon>
                        <AppBarButtonIcon>
                            <Icon name="search" size={22} />
                        </AppBarButtonIcon>
                        <AppBarButtonIcon>
                            <Icon name="menu-bars" size={22} />
                        </AppBarButtonIcon>
                    </AppBarButton>
                    <AppBarButton type="text-secondary">
                        <AppBarButtonLabel>Secondary</AppBarButtonLabel>
                    </AppBarButton>
                    <AppBarButton type="text-primary">
                        <AppBarButtonLabel>Primary</AppBarButtonLabel>
                    </AppBarButton>
                </div>
                <div className="flex flex-wrap items-center gap-3 bg-(--zinc-700) p-3">
                    <AppBarButton theme="overlay" aria-label="overlay 1-icon">
                        <AppBarButtonIcon>
                            <Icon name="search" size={22} />
                        </AppBarButtonIcon>
                    </AppBarButton>
                    <AppBarButton theme="overlay" type="back">
                        <AppBarButtonIcon>
                            <Icon name="angle-left" size={22} />
                        </AppBarButtonIcon>
                        <AppBarButtonLabel>Back</AppBarButtonLabel>
                    </AppBarButton>
                    <AppBarButton theme="overlay" type="text-primary">
                        <AppBarButtonLabel>Primary</AppBarButtonLabel>
                    </AppBarButton>
                </div>
                <p className="type-caption-meta text-text-body">
                    <code>overlay</code> pins its two paints to literals because Figma pins the
                    variant to Dark — it sits on media, not on the host theme.
                </p>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">
                    Star Balance — medium / large, and the raster Star Icon
                </h2>
                <div className="flex items-center gap-3 bg-(--background) p-3 outline outline-(--separator-default)">
                    <AppBarStarBalance>
                        <AppBarStarIcon />
                        <AppBarStarCount>8,734</AppBarStarCount>
                        <AppBarStarPlus aria-hidden>
                            <Icon name="plus" size={16} />
                        </AppBarStarPlus>
                    </AppBarStarBalance>
                    <AppBarStarBalance size="large">
                        <AppBarStarIcon />
                        <AppBarStarCount>8,734</AppBarStarCount>
                        <AppBarStarPlus size="large" aria-hidden>
                            <Icon name="plus" size={18} />
                        </AppBarStarPlus>
                    </AppBarStarBalance>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-text-body">Title — centred and large</h2>
                <div className="relative bg-(--background) outline outline-(--separator-default)">
                    <AppBar>
                        <AppBarButton aria-label="Back">
                            <AppBarButtonIcon>
                                <Icon name="angle-left" size={22} />
                            </AppBarButtonIcon>
                        </AppBarButton>
                        <AppBarTitle>
                            <AppBarTitleText>Title</AppBarTitleText>
                            <AppBarSubtitle>Subtitle</AppBarSubtitle>
                        </AppBarTitle>
                        <AppBarButton type="1-icon-active" aria-label="Confirm">
                            <AppBarButtonIcon>
                                <Icon name="check" size={22} />
                            </AppBarButtonIcon>
                        </AppBarButton>
                    </AppBar>
                </div>
                <div className="bg-(--background) outline outline-(--separator-default)">
                    <AppBar>
                        <AppBarTitle flow="start" align="left" size="large">
                            <AppBarTitleText size="large">Home</AppBarTitleText>
                        </AppBarTitle>
                        <AppBarButton aria-label="Search">
                            <AppBarButtonIcon>
                                <Icon name="search" size={22} />
                            </AppBarButtonIcon>
                        </AppBarButton>
                    </AppBar>
                </div>
            </section>
        </main>
    )
}
