import { getServerT } from '@shared/i18n/server'

/**
 * The last-resort streaming fallback, for a segment that brings no skeleton of its own.
 *
 * A server component so the announcement is in the request's language — it is the only text
 * here, and it is read aloud rather than seen. Screens that are worth a real skeleton have
 * their own `loading.tsx` next to the page (`(main)/[slug]`, `/my-wallet`, `/my-star`).
 */
export default async function Loading() {
    const t = await getServerT()
    return (
        <div
            className="flex min-h-[var(--window-height)] items-center justify-center"
            aria-busy="true"
            aria-live="polite"
        >
            <span className="size-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <span className="sr-only">{t('common_loading')}</span>
        </div>
    )
}
