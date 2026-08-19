'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback } from 'react'
import { type EnglishBundle, resolveCampaignText } from '../lib/campaign-text'

/**
 * `resolveCampaignText` bound to the live i18next instance — the hook the campaign cards call.
 *
 * The English bundle is read off i18next rather than imported, so it is whatever is actually
 * loaded. It is always there: English is `FALLBACK_LNG` and `client.ts` ships it in the initial
 * bundle for exactly that reason, so there is no state where a card has copy but no index.
 */
export function useCampaignText(): (text: string | null | undefined) => string {
    const { t, i18n } = useTranslation()

    return useCallback(
        (text: string | null | undefined) => {
            const bundle = (i18n.getResourceBundle('en', 'translation') ?? {}) as EnglishBundle
            return resolveCampaignText(bundle, text, key => t(key))
        },
        [t, i18n],
    )
}
