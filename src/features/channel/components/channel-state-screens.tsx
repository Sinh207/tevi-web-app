'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Trans } from 'react-i18next'
import type { Channel } from '../api/types'
import type { ChannelVisibility } from '../lib/channel-flags'
import { CHANNEL_PADDING } from '../lib/container'
import { CHANNEL_WALL_ART } from '../lib/illustrations'

/**
 * Every wall the channel page can put up.
 *
 * The sensitive-content gate is **not** one of them any more: that space renders its own shell with
 * the art blurred and the gate where its tabs would be (`channel-nsfw-gate.tsx`). A wall is for a
 * space whose content is not yours to see at all.
 *
 * ## An explanation, in the tabs' place
 *
 * The identity is **not** this component's any more: `channel-view` renders the real header above
 * every state, so the cover, avatar, name, bio, stats and socials are on screen and only the *tabs*
 * are replaced by the wall. That is legacy's arrangement — `content/index.js` puts `<Info />` above
 * the branch — and it is what tells a visitor they reached the space they meant to. Legacy expresses the same
 * intent as two independently-computed booleans (`isShowChannelStats` and `isShowSecondaryData`)
 * checked in different places, which is how they came to disagree; here `channelVisibility` has
 * already decided and this component only renders the answer.
 *
 * ## Illustrations are deliberately absent
 *
 * Legacy has two CDN images (unpublished 240×140, suspended 224×140) and two hand-drawn inline SVGs
 * (protected 67×105, blocked 142×177). The DS has none of them — its `__illustration` is a slot.
 * Pasting 177 lines of path data into this repo creates an un-versioned copy with no source, so the
 * sprite glyph carries the state until Brand publishes the set to the CDN. Named in the plan as a
 * design dependency rather than quietly approximated.
 */
export function ChannelStateScreen({
    channel,
    visibility,
}: {
    channel: Channel
    visibility: ChannelVisibility
}) {
    return <TerminalScreen channel={channel} visibility={visibility} />
}

function TerminalScreen({
    channel,
    visibility,
}: {
    channel: Channel
    visibility: ChannelVisibility
}) {
    const { t } = useTranslation()

    /**
     * Every wall here is a **your-space** surface: legacy keeps them under its `vs_*` namespace, and
     * `channelVisibility` short-circuits all of them for an owner, so none can ever be shown to the
     * person whose space it is. That is why three of them address the creator in the third person and
     * interpolate their name — copy an owner would never read.
     *
     * The strings are legacy's own, not paraphrases of them. An earlier version of this file invented
     * all five, which lost both the wording and the name: "You cannot view this space" where legacy
     * says "@ada has blocked you", and "This space is private" where legacy explains *how* to get in
     * ("Only confirmed followers have access to ada's contents… Tap the 'Follow' button to send a
     * follow request"). The second is not a nicer sentence, it is the only one that tells the reader
     * what to do.
     */
    /*
     * Two different things, and legacy is deliberate about which goes where:
     *
     * - **`handle`** for "You blocked @ada" — `blockedChannel` interpolates `channelSlug`, so it is
     *   the address you blocked, not a display name that two accounts could share.
     * - **`name`** for "Ada Lovelace has blocked you" — `blockedUser` replaces the whole `@[%s]`,
     *   the `@` included, with `channel?.name`.
     *
     * Both read `name` here for a while, which produced "You blocked @Ada Lovelace": a handle that
     * does not exist, spelled with somebody's spaces and capitals in it.
     */
    const name = channel.name ?? channel.slug
    const handle = channel.slug
    const copy: Record<
        string,
        {
            art: (typeof CHANNEL_WALL_ART)[keyof typeof CHANNEL_WALL_ART]
            title: string
            /** A node, not a string: the suspended wall carries a link inside its sentence. */
            body: ReactNode
        }
    > = {
        suspended: {
            art: CHANNEL_WALL_ART.suspended,
            title: t('channel_state_suspended_title'),
            /*
             * The link is **inside the sentence**, where legacy puts it — and where each language
             * puts the phrase, which is the reason for `Trans` rather than string surgery.
             *
             * Legacy composes it by deleting the phrase from the sentence and appending the link
             * after it, so the link always lands at the end however the language reads. Splitting on
             * the phrase would not work here either: only **five of nine** of our bodies contain
             * `channel_community_guidelines` verbatim — the rest say it their own way ("Nguyên tắc
             * Cộng đồng" against "Nguyên tắc cộng đồng", "커뮤니티 지침" against "커뮤니티
             * 가이드라인"), because the two keys came from two different legacy strings. Measured,
             * not assumed.
             *
             * So each locale wraps its own wording in `<0>…</0>` and `Trans` fills the tag. Nothing
             * is re-worded, and the link sits mid-sentence in the languages that put it there.
             */
            body: (
                <Trans
                    i18nKey="channel_state_suspended_body"
                    components={[
                        <Link
                            data-testid="channel-suspended-guidelines"
                            key="guidelines"
                            href="/community-guidelines"
                            className="text-(--text-link) underline"
                        >
                            {/* `Trans` replaces the children with the tag's contents. */}
                            guidelines
                        </Link>,
                    ]}
                />
            ),
        },
        'blocked-by': {
            art: CHANNEL_WALL_ART.blocked,
            title: t('channel_state_blocked_by_title', { name }),
            body: t('channel_state_blocked_by_body'),
        },
        blocking: {
            art: CHANNEL_WALL_ART.blocked,
            title: t('channel_state_blocking_title', { name: handle }),
            body: t('channel_state_blocking_body'),
        },
        unpublished: {
            art: CHANNEL_WALL_ART.unpublished,
            /*
             * Two lines, as legacy has them: `'Oops… This Space has been unpublished'` over the
             * explanation. This used the **body** as its title and left the second line empty, so
             * the one state that reads as a mistake ("This is an unpublished space") was the only
             * one missing the sentence that says so.
             */
            title: t('channel_state_unpublished_viewer_title'),
            body: t('channel_state_unpublished_viewer_body'),
        },
        protected: {
            art: CHANNEL_WALL_ART.protected,
            title: t('channel_state_protected_title'),
            body: t('channel_state_protected_body', { name }),
        },
    }

    const state = copy[visibility.kind]
    if (!state) return null

    return (
        <section
            className={cn(
                'flex min-w-0 flex-col items-center gap-6 text-center',
                CHANNEL_PADDING,
                'py-10',
                /*
                 * The card the header starts has to end somewhere, and this is where. Same pair the
                 * tab strip and the NSFW gate carry: surface fill and the bottom corners **from
                 * `md`**, because below that breakpoint the content *is* the page and a fill would
                 * draw a card edge where there is no edge.
                 *
                 * Without it the wall sat on the page ground with the header's card stopping dead
                 * above it — the one state where the space looked broken rather than closed.
                 */
                'bg-(--background-surface) md:rounded-b-[var(--radius-xl)]',
            )}
        >
            <div className="flex max-w-[420px] flex-col items-center gap-2">
                {/*
                 * Legacy's own artwork, at legacy's own box — `alt=""` because it is decoration: the
                 * title underneath says the same thing, and naming the picture would read it twice.
                 *
                 * A sprite glyph stood here before, which was the wrong instrument: a 32px `ban` in
                 * Icon-Secondary makes a suspension look like a form validation error. These are
                 * illustrations, and the states they explain are the ones a visitor meets least
                 * often and understands least — the picture is doing most of the work.
                 */}
                <Image
                    src={state.art.src}
                    alt=""
                    width={state.art.width}
                    height={state.art.height}
                    className="mb-2 h-auto max-w-full"
                    // Above the fold on the one screen it appears on, and the only image on it.
                    priority
                />
                <p className="type-body-emphasis text-(--text-title)">{state.title}</p>
                {state.body && (
                    <p className="type-dense-default text-(--text-subtitle)">{state.body}</p>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
                {/*
                 * **No Unblock here**, which is legacy's shape: its `blockedChannel` wall is a
                 * picture and two sentences, no control at all. Unblocking lives in Settings →
                 * Blocked accounts (`blocked-accounts-view.tsx`), where the whole list is, and that
                 * is also the only place it can be undone for an account whose space you cannot
                 * reach any more.
                 *
                 * It shipped here for a while on the reasoning that a wall must offer its own way
                 * out. It reads well and is wrong twice: the menu's Block row is hidden once
                 * blocked (legacy's rule too), so this page has no *entry* point to pair it with,
                 * and putting the undo on the page you land on by accident is how a block gets
                 * lifted by accident.
                 */}
                {/* Suspended and unpublished have nothing to act on, so the only affordance is
                    leaving — legacy's "Return to home". */}
                {(visibility.kind === 'suspended' || visibility.kind === 'unpublished') && (
                    /*
                     * `accent`. It is the only thing to press on a page that is otherwise a dead
                     * end, and this app's one call to action is accent — `secondary` read as the
                     * quiet half of a pair that does not exist here.
                     */
                    <Button
                        data-testid="channel-wall-home"
                        variant="accent"
                        size="large"
                        render={<Link href="/" />}
                    >
                        {t('channel_return_home')}
                    </Button>
                )}
            </div>
        </section>
    )
}
