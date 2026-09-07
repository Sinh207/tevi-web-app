'use client'

import { useAuth } from '@features/auth'
import { TextField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import type { FormEvent } from 'react'
import { useRedeemCode } from '../hooks/use-redeem-code'
import { GIFT_CODE_PANEL } from '../lib/container'
import { GIFT_CODE_ART } from '../lib/illustrations'
import { RedeemResultDialog } from './redeem-result-dialog'

/**
 * `/redeem-gift-code` — one card, one field, one button, and the panel that says what the code
 * contained.
 *
 * ## ⚠ Not in the design system — composed from its parts
 *
 * Reported rather than approximated, per `docs/DESIGN_SYSTEM.md`: the DS has no "redeem" screen and
 * no page-level illustration slot. Everything below is DS tokens, DS components and `FIELD_SURFACE`.
 *
 * The masthead is **Brand's own banner**, re-encoded from a 1.8 MB SVG-wrapped PNG to a 47 KB WebP
 * — same art, a format `next/image` can actually optimise. `lib/illustrations.ts` has the numbers,
 * the runbook and the two things the art cannot do (its words are baked in as English, and it is
 * drawn for a light background).
 *
 * ## The press is gated, the route is not
 *
 * A guest reads the page and the button reads **Sign in**, as `IdentityIntro` does on
 * `/identification`: pressing raises the sign-in dialog rather than navigating away. It also stays
 * *enabled* for a guest whatever is in the field — a disabled button is how somebody discovers
 * nothing, and the reason it cannot be pressed is a session, not the code.
 *
 * ## A real `<form>`
 *
 * So Enter submits, the field gets the on-screen keyboard's Go key, and password managers stay out
 * of it. Legacy hand-rolls `onKeyDown` with its own copy of the four submit conditions, which is a
 * second place for them to drift from the button's `disabled`.
 */
export function RedeemGiftCodeView() {
    const { t } = useTranslation()
    const { isAuthenticated, isAnonymous, isBootstrapping } = useAuth()
    const flow = useRedeemCode()

    /**
     * A **real** account, not just "has a session": the app mints an anonymous one on bootstrap, so
     * `isAuthenticated` alone is true for someone who has never signed in. Same pair of conditions
     * `useRequireAuth` and every gated read in this app key off.
     */
    const signedIn = isAuthenticated && !isAnonymous
    /**
     * Whether the *account question* has been answered at all.
     *
     * `currentUser` is a query with no SSR data, so `isAuthenticated` is `false` for the whole
     * bootstrap round trip — and this screen is opened from the URL printed on a gift card, i.e. cold,
     * with one button on it. A signed-in reader pressing that button in the first few hundred
     * milliseconds got `useRequireAuth`'s login dialog, which only closes on the `auth:signed-in`
     * event that bootstrap never emits: a modal they had to dismiss by hand to use their own account.
     *
     * So the button waits instead of guessing. `my-membership-view.tsx` documents the same call.
     */
    const accountKnown = !isBootstrapping

    /*
     * The key is spelled out rather than passed through as `t(flow.errorKey)`: `keys.test.ts` only
     * sees **literal** keys, and a key nothing can typo-check renders as its own name on screen —
     * `giftcode_error_invalid` under the field instead of a sentence. `RedeemErrorKey` is a union, so
     * a second reason added to the hook fails to compile here rather than going untranslated.
     */
    const fieldError =
        flow.errorKey === 'giftcode_error_invalid' ? t('giftcode_error_invalid') : null

    const onSubmit = (event: FormEvent) => {
        event.preventDefault()
        flow.submit()
    }

    return (
        <>
            {/*
             * The card, the padding and the two `md:` rules that make it one — all in
             * `GIFT_CODE_PANEL`, which is also where the reasoning lives. Below `md` there is no
             * card: the screen is the surface, as on `/identification` and the edit-profile form.
             */}
            <section className={GIFT_CODE_PANEL}>
                {/*
                 * Decorative, and `alt=""` rather than a description: the words in the picture are
                 * baked-in English, and the heading underneath says the same thing in the reader's
                 * own language. Describing it would announce the screen's title twice, in two
                 * languages.
                 *
                 * `priority` because it is the first thing on the page — left to lazy-load it pops
                 * in after the card has already been read.
                 *
                 * The cap is the art's **own** intrinsic width, read from the same constant the
                 * `width` prop uses rather than written out as `max-w-[451px]`: the column is 564
                 * wide from md, so without it the art upscales by 25% and softens, and with the
                 * number in two places one of them would be the stale one. It is a `style` because
                 * a Tailwind arbitrary value cannot read a constant — the same call `Skeleton`
                 * makes for its `w`.
                 */}
                <Image
                    src={GIFT_CODE_ART.banner.src}
                    alt=""
                    aria-hidden
                    width={GIFT_CODE_ART.banner.width}
                    height={GIFT_CODE_ART.banner.height}
                    priority
                    className="h-auto w-full"
                    style={{ maxWidth: GIFT_CODE_ART.banner.width }}
                />

                <header className="flex flex-col items-center gap-1 text-center">
                    <h2 className="type-title-t2-semibold text-(--text-title)">
                        {t('giftcode_heading')}
                    </h2>
                    <p className="type-body-default text-(--text-subtitle)">{t('giftcode_body')}</p>
                </header>

                <form
                    data-testid="gift-code-form"
                    onSubmit={onSubmit}
                    className="flex w-full flex-col gap-2"
                    noValidate
                >
                    <TextField
                        data-testid="gift-code-input"
                        label={t('giftcode_field_label')}
                        placeholder={t('giftcode_placeholder')}
                        value={flow.code}
                        onChange={event => flow.changeCode(event.target.value)}
                        error={fieldError}
                        /*
                         * A code is not a word and not a name: no autocorrect, no capitalisation,
                         * no spellcheck, no autofill. Every one of those has a failure mode here —
                         * an auto-capitalised code is a rejection on a case-sensitive backend, and
                         * we do not know that it is not one (see `normalizeCode`).
                         */
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        /*
                         * Long enough for any code anybody has seen, short enough that a pasted
                         * paragraph cannot become a request body. Not a format claim — see
                         * `MIN_CODE_LENGTH`.
                         */
                        maxLength={64}
                        suffix={
                            /*
                             * Clearing is worth a control on this screen specifically: the field
                             * holds a 16-character string typed by hand off a card, and the usual
                             * fix for a wrong one is to start again. It disappears when there is
                             * nothing to clear rather than sitting there inert.
                             */
                            flow.code ? (
                                <Button
                                    data-testid="gift-code-clear"
                                    type="button"
                                    variant="ghost"
                                    size="small"
                                    iconOnly
                                    aria-label={t('giftcode_clear_code')}
                                    onClick={() => flow.changeCode('')}
                                    className="text-(--icon-secondary)"
                                >
                                    <Icon name="xmark-circle" weight="filled" size={18} />
                                </Button>
                            ) : undefined
                        }
                    />
                    <Button
                        data-testid="gift-code-submit"
                        type="submit"
                        variant="accent"
                        size="large"
                        fullWidth
                        /*
                         * Enabled for a guest whatever the field holds — the press is what tells
                         * them they need an account. For a signed-in reader it is the field and the
                         * request in flight that decide. **While the session is still resolving it
                         * is disabled**, because until then this button does not know which of the
                         * two it is: pressing it raised a login dialog at an already-signed-in
                         * reader (see `accountKnown`).
                         */
                        disabled={
                            !accountKnown || (signedIn && (!flow.canSubmit || flow.isRedeeming))
                        }
                    >
                        {flow.isRedeeming || !accountKnown ? (
                            <Loader className="size-5 [&>span]:bg-current" />
                        ) : null}
                        {/*
                         * The redeem label while the account is unknown, not "Sign in": it is the
                         * label this screen is *for*, and a button that says "Sign in" for 300ms and
                         * then changes its mind reads as a glitch.
                         */}
                        {signedIn || !accountKnown
                            ? t('giftcode_action_redeem')
                            : t('auth_sign_in')}
                    </Button>
                </form>
            </section>

            <RedeemResultDialog flow={flow} />
        </>
    )
}
