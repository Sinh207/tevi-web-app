'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { clearETagCache } from '@shared/lib/api/interceptors/etag'
import { formatBytes, readStorageUsage, type StorageUsage } from '@shared/lib/storage-usage'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { FieldLabel } from '@shared/ui/field-label'
import type { IconProps } from '@shared/ui/icon'
import { LeftBarList, LeftBarRow, LeftBarSection } from '@shared/ui/left-bar'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TILE } from '../../lib/menu-tiles'

/**
 * Data and storage — what this app is keeping on the device, and the one control
 * that gives it back.
 *
 * Neither the legacy app nor the design system has this screen, so it is built from
 * the drawer's own parts and says only what the browser can actually be asked. That
 * is the whole design brief: **no setting here is invented.** A row of data-saver
 * toggles would look right and mean nothing until there is media to save data on,
 * and a "Storage used" figure we made up would be worse than none.
 *
 * The three figures are three different questions, not slices of one pie — see
 * `shared/lib/storage-usage.ts`. The caption under them says the total is an
 * estimate because it is: the Storage API pads what it reports so a page cannot use
 * quota as a fingerprint, and it can lag a write by a moment.
 */

/** Shown until the first measurement lands, and for anything the browser withholds. */
const UNKNOWN = '—'

export function DataStorageScreen({ active }: { active: boolean }) {
    const { t, currentLanguage } = useTranslation()
    const queryClient = useQueryClient()
    const [usage, setUsage] = useState<StorageUsage | null>(null)
    const [confirming, setConfirming] = useState(false)
    const [clearing, setClearing] = useState(false)

    /*
     * Measured when the screen comes into view, not when it mounts: the drawer keeps
     * all of its screens mounted and parked off-screen (see `menu-drawer.tsx`), so a
     * mount-time read would hit IndexedDB and the Storage API on every page load, for
     * a panel nobody has opened. Re-measured on each visit, because a session's worth
     * of requests happened since the last one.
     */
    useEffect(() => {
        if (!active) return
        let alive = true
        void readStorageUsage().then(next => {
            if (alive) setUsage(next)
        })
        return () => {
            alive = false
        }
    }, [active])

    /*
     * The three rows, each carrying its own figure — rather than a table of rows and a
     * lookup that maps a translation key back to a field. That mapping is only ever one
     * rename away from silently falling through to the wrong number, and there is
     * nothing here worth hoisting to module scope: `t`, `usage` and the locale are all
     * in this closure, and it is three objects a render.
     *
     * `null` is "the browser would not say", which is a different thing from zero and
     * renders as a dash.
     */
    const stats: { key: string; icon: IconProps; tile: string; value: string | null }[] = [
        {
            key: 'data_storage_cached_responses',
            icon: { name: 'database', weight: 'filled' },
            tile: TILE.success,
            value: usage && t('data_storage_items', { count: usage.cachedResponses }),
        },
        {
            key: 'data_storage_local_data',
            icon: { name: 'sliders-simple', weight: 'filled' },
            tile: TILE.indigo,
            value: usage && formatBytes(usage.localDataBytes, currentLanguage),
        },
        {
            key: 'data_storage_site_total',
            icon: { name: 'folder' },
            tile: TILE.zinc,
            value: usage?.siteBytes == null ? null : formatBytes(usage.siteBytes, currentLanguage),
        },
    ]

    /**
     * Clearing drops the ETag store — memory tier and IndexedDB both — and then marks
     * every query stale so whatever is on screen comes back from the network rather
     * than from a validator that no longer has a body behind it.
     *
     * `invalidateQueries`, deliberately **not** `queryClient.clear()`. Clearing would
     * evict `authKeys.me(activeId)` along with everything else, and `isAuthenticated`
     * is derived from that query — so for the moment it takes to refetch, the whole
     * shell would flicker through "signed out" because someone pressed a button about
     * *disk space*. Invalidating keeps the data in place and replaces it.
     *
     * Failure is not surfaced separately: `clearETagCache` swallows its own IndexedDB
     * errors by design (a cache must never crash the page), so there is no meaningful
     * failure to report — the re-measurement underneath is the honest answer either way.
     */
    const clearCache = async () => {
        setClearing(true)
        try {
            await clearETagCache()
            void queryClient.invalidateQueries()
            toast.success(t('data_storage_cleared'))
        } finally {
            setClearing(false)
            setConfirming(false)
            // Re-read rather than assume: the invalidation above is already refetching,
            // and some of those responses will have landed a new ETag by now. Showing a
            // confident zero the store does not actually hold would be the one lie on a
            // screen whose whole job is to report what is there.
            void readStorageUsage().then(setUsage)
        }
    }

    return (
        <>
            <LeftBarSection>
                <FieldLabel className="h-[32px]">{t('data_storage_section_usage')}</FieldLabel>
                <LeftBarList bordered>
                    {stats.map((row, i) => (
                        <LeftBarRow
                            key={row.key}
                            // Reports, does not act — so no button, no cursor, no chevron.
                            as="div"
                            rule={i > 0}
                            title={t(row.key)}
                            icon={row.icon}
                            tile={row.tile}
                            chevron={false}
                            trailing={
                                <span className="type-dense-default text-(--text-body)">
                                    {row.value ?? UNKNOWN}
                                </span>
                            }
                        />
                    ))}
                </LeftBarList>
                {/*
                 * The note explains the total, so it goes when there is no total to explain —
                 * a caption about an estimate, sitting under a dash, is worse than silence.
                 * Written against `!== null` rather than a truthy check so it renders during
                 * the measurement too: hiding it until the figures land and then dropping it
                 * in would move the list on the one screen nobody is watching closely.
                 */}
                {usage?.siteBytes !== null && (
                    <p className="type-dense-default px-4 py-2 text-(--text-subtitle)">
                        {t('data_storage_usage_note')}
                    </p>
                )}
            </LeftBarSection>

            <LeftBarSection>
                <FieldLabel className="h-[32px]">{t('data_storage_section_manage')}</FieldLabel>
                <LeftBarList bordered>
                    <LeftBarRow
                        title={t('data_storage_clear_cache')}
                        icon={{ name: 'trash', weight: 'filled' }}
                        tile={TILE.error}
                        // Fires in place — nothing to drill into.
                        chevron={false}
                        aria-disabled={clearing || undefined}
                        onClick={() => !clearing && setConfirming(true)}
                    />
                </LeftBarList>
                <p className="type-dense-default px-4 py-2 text-(--text-subtitle)">
                    {t('data_storage_clear_note')}
                </p>
            </LeftBarSection>

            {/* Kept mounted so the pending state survives the round trip. */}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={t('data_storage_clear_title')}
                description={t('data_storage_clear_description')}
                confirmLabel={t('data_storage_clear_confirm')}
                onConfirm={clearCache}
                pending={clearing}
                destructive
            />
        </>
    )
}
