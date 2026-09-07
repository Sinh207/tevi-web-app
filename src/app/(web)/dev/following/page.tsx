import {
    CHANNEL_SETTINGS_CONTAINER,
    ChannelEmptyState,
    FOLLOWING_ART,
    FollowingLimitNotice,
    FollowingSkeleton,
} from '@features/channel'
import { Button } from '@shared/ui/button'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FOLLOWED, LIVES } from './fixtures'
import { FollowingLivesPreview } from './live-preview'
import { FollowingPreview } from './preview'
import { FollowingSortPreview } from './sort-preview'

export const metadata: Metadata = {
    title: 'Following',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of the `/following` rows: `pnpm dev`, then open /dev/following. 404s in
 * production (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists for the reason `/dev/follow-requests` does, and the list of conditions is longer: the
 * shipped screen shows a **pinned** row only for an account that has pinned somebody, a muted glyph
 * only for one that has muted somebody, the "Show more" disclosure only for one following more than
 * five creators who are *live at that moment*, and the app-only dialog only for a stream whose
 * `restricted_platforms` names the website. None of those is arrangeable, and three of them are the
 * parts most likely to be wrong.
 *
 * Every state on this page is pure props, so all of them render honestly: this is a preview of the
 * shipped components with the shipped geometry, not a mock of them.
 *
 * What it deliberately does **not** preview is `FollowingView` — that component owns two queries, a
 * mutation and a five-second timer, and a version of it that did not would be a second
 * implementation of the screen with its own drift. Its signed-out state is reachable by signing out
 * and its over-limit notice by following 901 spaces, which is a fixture nobody should write.
 */
export default function DevFollowingPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-col gap-10 p-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t1-bold text-(--text-title)">Following</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/channel` — the DS List/User Item row (2089:2965) as /following renders
                    it, with the two axes nothing else uses: <code>Pinned</code> and{' '}
                    <code>Muted</code>. Open a kebab and press Pin or Mute to watch the flags flip,
                    or Unfollow to watch the exit. Narrow the window to 390px to check that the
                    kebab still fits beside a long name.
                </p>
            </header>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">rows</h2>
                <div className={CHANNEL_SETTINGS_CONTAINER}>
                    <FollowingPreview rows={FOLLOWED} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">ordering</h2>
                <div className={CHANNEL_SETTINGS_CONTAINER}>
                    <FollowingSortPreview />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">
                    live now — open · priced · members-only · both · member-holds-it · app-only
                </h2>
                <div className={CHANNEL_SETTINGS_CONTAINER}>
                    <FollowingLivesPreview lives={LIVES} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                {/* Unreachable on the real screen without an account following 901 spaces, which is
                    the whole reason it is a component and not markup inside the view. */}
                <h2 className="type-micro-overline text-(--text-body)">over the follow limit</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <div className="p-4">
                        <FollowingLimitNotice />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline text-(--text-body)">empty</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <ChannelEmptyState
                        art={FOLLOWING_ART.empty}
                        title="You're not following anyone yet"
                        body="Follow creators to keep up with their latest posts and streams."
                        action={
                            <Button variant="accent" size="large">
                                Explore creators
                            </Button>
                        }
                    />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                {/* The follow list only. The Live now strip has **no** loading state — see
                    `following-view.tsx`: a header over two shimmer rows would be a layout shift for
                    the majority of readers, whose follows are not live. */}
                <h2 className="type-micro-overline text-(--text-body)">loading</h2>
                <div
                    className={`${CHANNEL_SETTINGS_CONTAINER} overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]`}
                >
                    <FollowingSkeleton count={4} />
                </div>
            </section>
        </main>
    )
}
