'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Link from 'next/link'

/**
 * *"By continuing, you agree to our Terms and policies."* — under every button that saves a payout
 * method, and under the Add-new-method button on the list.
 *
 * Legacy prints this in three places by `String.replace`-ing the link text out of the translated
 * sentence and handing the result to `dangerouslySetInnerHTML`. That is an XSS sink fed by a
 * *translation file* (so a bad locale string is script execution on the screen that moves money), and
 * it silently degrades to a plain sentence in any locale whose translation does not happen to contain
 * the exact link phrase — which is every locale where the phrase was translated as part of the
 * sentence. Prefix plus link, the shape `topup-confirm-dialog.tsx` already uses here.
 *
 * **New tab.** `/terms` is an in-app route, so a `Link` would navigate — and on the setup screen that
 * throws away a half-filled bank form. Reading what you are agreeing to must not cost you the form.
 *
 * ## The wording is overridable, because legacy says something more specific on one screen
 *
 * The setup screens read *"By continuing, you agree to our Terms and policies."* The **withdraw request**
 * screen reads *"By clicking “Send request”, you are agreeing to Tevi Terms and conditions"* — it names
 * the button, which is worth keeping: an agreement attached to a specific press is clearer than one
 * attached to being on the page.
 *
 * Two optional keys rather than a second component: the mechanism (prefix + real `Link`, new tab, no
 * `dangerouslySetInnerHTML`) is the part worth having once.
 */
export function PayoutTermsNote({
    className,
    testId,
    prefixKey = 'payout_terms_prefix',
    linkKey = 'payout_terms_link',
}: {
    className?: string
    testId?: string
    /** Override the sentence. Defaults to the setup screens' wording. */
    prefixKey?: string
    /** Override the link's words. Defaults to *Terms and policies*. */
    linkKey?: string
}) {
    const { t } = useTranslation()

    return (
        <p className={cn('type-caption-meta m-0 text-center text-(--text-body)', className)}>
            {t(prefixKey)}{' '}
            <Link
                data-testid={testId}
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--text-link) underline hover:no-underline"
            >
                {t(linkKey)}
            </Link>
        </p>
    )
}
