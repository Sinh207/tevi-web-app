'use client'

import {
    accountNsfwSettings,
    accountShowSensitive,
    useAuth,
    useRequireAuth,
    useUpdateMe,
} from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useEffect, useState } from 'react'

/**
 * The sensitive-content cover over a post's media — legacy's `NsfwGuard`, all three of its layers.
 *
 * ## There are two covers, not one, and which you get depends on a setting
 *
 * This is the part a shorter version loses. Legacy's `useNsfwGuard` picks between them:
 *
 * | the reader | first cover | what it offers |
 * |---|---|---|
 * | filtering **on** (`show_sensitive` false) | *Sensitive content warning* | turn filtering **off** |
 * | filtering **off** | *Content warning: NSFW* | *Show* — reveal this one post |
 * | the post is **their own** | *Content warning: NSFW* | the same |
 *
 * They are mutually exclusive by construction. With filtering on, offering "show once" would let a
 * setting the reader deliberately turned on be overruled by a button — so the only honest offer is
 * the switch itself. With filtering off, the setting is not the obstacle and a per-post reveal is
 * exactly right.
 *
 * The card previously drew one cover and ignored `show_sensitive` entirely, which meant a reader who
 * had turned filtering **off** in Settings was still covered on every post. The setting had no
 * effect anywhere in the product.
 *
 * ## It wraps the **media**, not the post
 *
 * Legacy's guard goes around each media block and the caption stays readable. That is the detail
 * worth keeping: a cover over the whole card tells the reader nothing about why it is there, and a
 * post whose words are the point becomes unreadable for an image beside them.
 *
 * ## The settings offer writes the setting; it does not link to a page
 *
 * Legacy opens its own sensitive-content modal from here, and the obvious port — a link to
 * `/settings/sensitive-content` — would 404: in this app the toggle lives on the account drawer's
 * **Privacy and Security** screen, which is a drawer view and not a route, and `features/post` may
 * not import `features/navigation` to open it. So the button does what the drawer's switch does,
 * through the same call: `useUpdateMe` with the whole `nsfw_settings` object.
 *
 * ⚠ **The object is sent whole.** The endpoint replaces it, so `blur_media` and `nsfw_search` have
 * to come back with `show_sensitive` or they are silently reset to the backend's defaults.
 * `use-nsfw-gate.ts` and the Settings screen both carry that warning; this is the third caller.
 *
 * Unlike `useNsfwGate`, this does **not** also record a space consent. That hook is gating a whole
 * space and needs both halves; a post in a feed is not a space, and filing consent for one from a
 * press on a single card would let one post open every sensitive post of that creator.
 *
 * ## The reveal is per card, and it can be put back
 *
 * Channel-level consent (`shared/lib/nsfw-consent.ts`) is keyed on a **slug and an account** — the
 * right scope for "I am willing to look at this space", the wrong one for one post in a feed of
 * many, and deliberately not touched here: a press on one card must not silently consent to a whole
 * space. Legacy's guard can be hidden again after revealing (`NsfwHideButton`), so this one can too.
 *
 * ## `show_sensitive` is read in an **effect**
 *
 * `currentUser` is `null` during the session bootstrap, so the first client render has filtering
 * **on** — the safe direction — and the second cover only appears once the account is known.
 * Reading it during render and branching would be correct too; the effect exists so the *revealed*
 * state resets when the account changes, which is the case an account switch in another tab
 * produces.
 */
export function PostNsfwGuard({
    children,
    isOwn,
    testId,
}: {
    children: React.ReactNode
    /** The reader's own post — never gets the settings cover, only the reveal-once one. */
    isOwn: boolean
    testId?: string
}) {
    const { t } = useTranslation()
    const { currentUser, activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const { update, isPending } = useUpdateMe()
    const [revealed, setRevealed] = useState(false)

    const showsSensitive = accountShowSensitive(currentUser)

    /*
     * Consent is per account, so a switch takes the reveal with it. Without this, switching from an
     * account that had revealed a post to one that had not leaves the media uncovered for the
     * second — the card is the same React element and its state survives the switch.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: `activeId` is the trigger, not a value the effect reads — the rule cannot see that a setter-only effect is keyed on it deliberately.
    useEffect(() => {
        setRevealed(false)
    }, [activeId])

    /**
     * Which cover, and legacy's exact condition. The settings cover is for a reader who has
     * filtering on **and** is not the author; everyone else gets the reveal-once one.
     */
    const cover: 'settings' | 'reveal' = !showsSensitive && !isOwn ? 'settings' : 'reveal'
    const covered = !revealed

    return (
        <div className="relative min-w-0" data-testid={testId}>
            {/*
             * `blur-xl` **and** `pointer-events-none`. The blur alone is a picture the reader can
             * still tap through to a lightbox, which is how a cover ends up being decoration — and
             * `select-none` because a screenshot of blurred media is not the threat, a right-click
             * "open image in new tab" is.
             */}
            <div className={cn(covered && 'pointer-events-none select-none blur-xl')}>
                {children}
            </div>

            {covered ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[8px] bg-(--background-overlay) px-4 text-center">
                    <Icon name="eye-slash" size={24} className="text-(--icon-secondary)" />
                    <p
                        data-testid={subTestId(testId, 'title')}
                        className="type-dense-emphasis text-(--text-title)"
                    >
                        {t(cover === 'settings' ? 'post_nsfw_sensitive_title' : 'post_nsfw_title')}
                    </p>
                    <p className="type-caption-meta max-w-[320px] text-(--text-subtitle)">
                        {t(cover === 'settings' ? 'post_nsfw_sensitive_body' : 'post_nsfw_body')}
                    </p>
                    {cover === 'settings' ? (
                        /*
                         * Optimistic and not awaited, the same trade `useNsfwGate.disableFiltering`
                         * makes: if the write fails, `show_sensitive` reverts and this cover simply
                         * comes back. Threading `mutateAsync` out of `useUpdateMe` would buy a
                         * marginally tidier failure for a case nobody sees.
                         */
                        <Button
                            variant="secondary"
                            size="small"
                            disabled={isPending}
                            onClick={requireAuth(() =>
                                update({
                                    nsfw_settings: {
                                        ...accountNsfwSettings(currentUser),
                                        show_sensitive: true,
                                    },
                                }),
                            )}
                            data-testid={subTestId(testId, 'trigger')}
                        >
                            {t('post_nsfw_disable_filtering')}
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="small"
                            onClick={() => setRevealed(true)}
                            data-testid={subTestId(testId, 'reveal')}
                        >
                            {t('post_nsfw_show')}
                        </Button>
                    )}
                </div>
            ) : (
                /*
                 * Put it back. 32px target in the trailing corner, `end-2` so it follows the writing
                 * direction, and fixed black-on-white rather than a token because it sits on an
                 * arbitrary photograph — the same reasoning `PostLockPanel`'s pill carries.
                 */
                <button
                    type="button"
                    onClick={() => setRevealed(false)}
                    aria-label={t('post_nsfw_hide')}
                    title={t('post_nsfw_hide')}
                    data-testid={subTestId(testId, 'close')}
                    className="absolute end-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                    <Icon name="eye-slash" size={16} />
                </button>
            )}
        </div>
    )
}
