'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback } from 'react'
import type { SavedCard } from '../api/types'
import { composeCardName, savedCardTitle } from '../lib/card-brand'

/**
 * `card => "Visa •••• 4242"`, for every surface that has to name one.
 *
 * The two halves live in `lib/card-brand.ts` and are pure; this is the seam where `t` joins them,
 * because `savedCardTitle` deliberately returns a *key* for the one branch where the payload said
 * nothing and a lib module has no translator.
 *
 * A hook rather than a helper taking `t`: three call sites in two files, and each would otherwise
 * repeat the same four lines of `'text' in title ? … : t(title.key)` — which is exactly how the row
 * and the delete dialog came to name the same card differently.
 */
export function useCardName() {
    const { t } = useTranslation()

    return useCallback(
        (card: SavedCard): string => {
            const title = savedCardTitle(card)
            return composeCardName('text' in title ? title.text : t(title.key), card.card?.last4)
        },
        [t],
    )
}
