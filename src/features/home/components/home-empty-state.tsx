'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import type { TeviIconName } from '@shared/ui/icon-names'
import Link from 'next/link'

/**
 * What the feed shows when it has nothing — legacy's `notPost`, generalised to the four cases home
 * actually has.
 *
 * ## Four states, not one
 *
 * | | when | what it offers |
 * |---|---|---|
 * | signed out | no account, so no follow list | **Sign in** |
 * | empty | signed in, following nobody who has posted | **Discover creators** → `/search` |
 * | no lives | signed in, nobody followed is on air | **Discover creators** → `/search` |
 * | error | the request failed | retry |
 *
 * Collapsing the first two is the tempting mistake: a guest told "the spaces you follow have not
 * posted anything" is told something false, and offering them *Discover creators* sends them to a
 * search page where every follow button will raise a sign-in dialog. They are different problems
 * with different exits.
 *
 * The error state is separate from both for the reason `ChannelThreadList` gives: an empty state on
 * a failed request claims there is nothing here, which is the one thing nobody knows.
 *
 * ## Two kinds of exit, because two of them are not navigations
 *
 * *Discover creators* is a `Link`: `/search` is a real page, so it is middle-clickable, openable in
 * a new tab and announced as a link. Legacy uses a `Button` with `router.push`, which is none of
 * those.
 *
 * *Sign in* is not. It raises the app's one login dialog through `useRequireAuth(() => undefined)`
 * — the same idiom `/my-wallet`'s signed-out card uses, and the reason there is no `/login`
 * navigation here: a reader who signs in from a dialog stays on the feed and watches it fill,
 * where a round trip through `/login` would land them back at `/` having lost the tab they were on.
 * The callback is empty because the dialog *is* the whole action: `useRequireAuth` runs its
 * argument only for an account that already exists, and by construction nobody here has one.
 *
 * Geometry follows `docs/DESIGN_SYSTEM.md`'s empty-state rule: a 16/600 title over a
 * `max-w-[400px]` body.
 */
/**
 * Four states, three tables — rather than three nested ternaries repeating the same four-way branch.
 *
 * A ternary chain has to be read three times to answer "what does `no-lives` look like", and the
 * fourth state was added to exactly one of the three the first time round. A table per slot makes a
 * missing entry a **type error**, because the key is the union.
 */
const ICONS: Record<HomeEmptyKind, TeviIconName> = {
    'signed-out': 'user-simple-alt',
    empty: 'comment-dots',
    'no-lives': 'film-play',
    error: 'exclamation-circle',
}

const TITLES: Record<HomeEmptyKind, string> = {
    'signed-out': 'home_feed_signed_out_title',
    empty: 'home_feed_empty_title',
    'no-lives': 'home_lives_empty_title',
    error: 'home_feed_error_title',
}

const BODIES: Record<HomeEmptyKind, string> = {
    'signed-out': 'home_feed_signed_out_body',
    empty: 'home_feed_empty_body',
    'no-lives': 'home_lives_empty_body',
    error: 'home_feed_error_body',
}

export type HomeEmptyKind = 'signed-out' | 'empty' | 'no-lives' | 'error'

export function HomeEmptyState({
    kind,
    onRetry,
    testId = 'home-empty',
}: {
    kind: HomeEmptyKind
    /** Only read on `error`. */
    onRetry?: () => void
    testId?: string
}) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()

    const icon: TeviIconName = ICONS[kind]

    return (
        <div
            data-testid={testId}
            className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center"
        >
            <span className="flex size-12 items-center justify-center rounded-full bg-(--background-segment) text-(--icon-secondary)">
                <Icon name={icon} size={24} />
            </span>
            <p
                data-testid={subTestId(testId, 'title')}
                className="type-title-t3-semibold text-(--text-title)"
            >
                {t(TITLES[kind])}
            </p>
            <p className="type-dense-default max-w-[400px] text-(--text-subtitle)">
                {t(BODIES[kind])}
            </p>

            {kind === 'error' ? (
                <Button
                    variant="secondary"
                    size="medium"
                    onClick={onRetry}
                    data-testid={subTestId(testId, 'retry')}
                >
                    {t('common_retry')}
                </Button>
            ) : kind === 'signed-out' ? (
                /*
                 * Raises the login dialog rather than navigating — see the header. It shares
                 * `trigger` with the discover button because they occupy the same slot: a test
                 * asserting "the empty state's exit was pressed" should not have to know which of
                 * the two states it is in, and `kind` is already readable from the title.
                 */
                <Button
                    variant="primary"
                    size="medium"
                    data-testid={subTestId(testId, 'trigger')}
                    onClick={requireAuth(() => undefined)}
                >
                    {t('auth_sign_in')}
                </Button>
            ) : (
                <Button
                    variant="accent"
                    size="medium"
                    data-testid={subTestId(testId, 'trigger')}
                    /* The app's idiom for a "go somewhere" button — `button.tsx` derives the link
                       role from the render element rather than asking every call site to say so. */
                    render={<Link href="/search" />}
                >
                    {t('home_feed_discover')}
                </Button>
            )}
        </div>
    )
}
