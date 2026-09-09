'use client'

import { DialogCloseButton } from '@shared/components/dialog-close-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Trans } from 'react-i18next'
import { MONETIZATION_ART } from '../lib/illustrations'
import { REVENUE_WINDOW_DAYS } from '../lib/methods'

/**
 * What the headline figure on `/monetization` actually is — four bullets behind the `?`.
 *
 * ## Why a dialog this small still earns its own file and this note
 *
 * The number above it is money somebody is counting on, and the four sentences answer the question a
 * creator arrives with: *is this what I will be paid?* The answer is no — it is an estimate, it is
 * before deductions, and only the amount that reaches the wallet is final. A creator who does not
 * know that reads a payout as short. `BalanceHelpButton` makes the same argument for `/my-wallet`
 * and the two are deliberately the same shape: a title, a body, a way out, no footer button.
 *
 * ## The contact link, and `Trans` rather than string surgery
 *
 * The third bullet carries legacy's full sentence — *"…is final. Have questions? Contact us
 * **here**."* — with **here** linking to `/feedback`, legacy's own destination.
 *
 * ⚠ **`/feedback` is not ported yet, so this link 404s until it is.** It is here because the
 * behaviour was asked for explicitly; when the feedback screen lands, the path should come from that
 * feature's own `routes.ts` rather than staying a literal here.
 *
 * The anchor is placed by **each locale**, not by us. Legacy composes the bullet as
 * `t(sentence) + ' ' + <link>{t('here')}</link> + '.'`, which pins the link to the end of the
 * sentence however the language reads — and it is already wrong in three of the nine locales this
 * app ships: `zh-TW`, `zh-CN` and `ko` end their sentence *before* the anchor slot
 * (`請在聯絡我們。` — the word belongs between 在 and 聯絡), so legacy renders
 * *"…請在聯絡我們。 這裡."*. Splitting the string on a marker has the same defect, and
 * `view-program-chip.tsx` says so about legacy's `split('[%s]')`.
 *
 * So each locale wraps its own wording in `<0>…</0>` and `Trans` fills the tag — the pattern
 * `channel-state-screens.tsx` uses for the Community Guidelines link inside its wall copy. The three
 * CJK locales now put the anchor mid-sentence, where their grammar wants it.
 *
 * ## `[%s]` → `{{days}}`
 *
 * Legacy interpolates with `.replace('[%s]', 30)` on a string whose placeholder is a printf token; the
 * count lives in `REVENUE_WINDOW_DAYS` here so the copy and the claim move together. Whether
 * `income_usd` really covers 30 days is **B102**.
 */
/**
 * Legacy's `/feedback`, which its *"Contact us here"* link pushes.
 *
 * A literal, and deliberately not a `routes.ts` entry: this app has no feedback feature yet, so
 * there is nothing to own the constant — the account drawer's own *Send feedback* row is still
 * without an `href` for the same reason. **The page does not exist, so this link 404s today.** When
 * it is built, this moves to that feature's `routes.ts` and this comment goes with it.
 */
const FEEDBACK_PATH = '/feedback'

export function RevenueInfoDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const { t } = useTranslation()

    /*
     * Keyed on a code-authored slug, not on the sentence: a translated string as a React `key`
     * remounts all four on every language change, and would collide outright if two locales ever
     * translated two of these the same way. Each full key is written out rather than built from the
     * slug, so a search for the key finds this file.
     */
    const bullets: { key: string; text: ReactNode }[] = [
        { key: 'estimate', text: t('monetization_revenue_info_estimate') },
        { key: 'deductions', text: t('monetization_revenue_info_deductions') },
        {
            key: 'final',
            text: (
                <Trans
                    i18nKey="monetization_revenue_info_final"
                    components={[
                        <Link
                            data-testid="monetization-revenue-info-contact"
                            key="contact"
                            href={FEEDBACK_PATH}
                            className="text-(--text-link) underline"
                        >
                            {/* `Trans` replaces these children with the tag's own contents. */}
                            here
                        </Link>,
                    ]}
                />
            ),
        },
        { key: 'programs', text: t('monetization_revenue_info_programs') },
    ]

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="monetization-revenue-info" className="w-[420px] gap-3">
                {/*
                 * Title and dismiss on one row — the **in-flow** placement of the two
                 * `docs/DESIGN_SYSTEM.md` §7 sanctions, and the one its table names for a title that
                 * is ranged left and can wrap. This one wraps to two lines on a phone in every locale.
                 *
                 * §7's other note — *"last in the DOM matters, base-ui focuses the first focusable
                 * element"* — belongs to the `absolute` placement and buys nothing here: this dialog
                 * only explains, so the dismiss is its **only** focusable element and opening it puts
                 * focus there whatever the DOM order (measured: `activeElement` is the Close button).
                 * `BalanceHelpButton` and `PayoutFeeHelp` are the same shape for the same reason. What
                 * a screen reader announces first is still the sentence, because `DialogTitle` names
                 * the popup.
                 */}
                <div className="flex items-start justify-between gap-3">
                    {/* `pt-2` only — `DialogTitle` already carries `type-body-strong` and
                        `text-text-title`; the padding is what lines the first line up with the 40px
                        disc that `-mt-2` pulls out into the shell's own padding. */}
                    <DialogTitle className="pt-2">
                        {t('monetization_revenue_window', { days: REVENUE_WINDOW_DAYS })}
                    </DialogTitle>
                    <DialogCloseButton
                        onClose={() => onOpenChange(false)}
                        className="-me-2 -mt-2"
                    />
                </div>

                {/* Declared at its drawn box (229×131) rather than the file's own resolution, so the
                    space is reserved before the bytes arrive and nothing under it jumps. */}
                <Image
                    src={MONETIZATION_ART.paidInteractions.src}
                    width={MONETIZATION_ART.paidInteractions.width}
                    height={MONETIZATION_ART.paidInteractions.height}
                    alt=""
                    aria-hidden
                    className="mx-auto h-auto w-[229px] max-w-full"
                />

                <ul className="m-0 flex list-disc flex-col gap-2 ps-5">
                    {bullets.map(bullet => (
                        <li key={bullet.key} className="type-dense-default text-(--text-body)">
                            {bullet.text}
                        </li>
                    ))}
                </ul>
            </DialogContent>
        </Dialog>
    )
}
