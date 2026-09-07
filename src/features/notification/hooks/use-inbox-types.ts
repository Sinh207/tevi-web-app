'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { forgetInboxCache, notificationApi, notificationKeys } from '../api/notification-api'
import type { InboxSetting, InboxType } from '../api/types'
import { clearInbox, type InboxData } from '../lib/inbox-page'

/**
 * "Notification you want to see" — the switches, the unsaved draft, and the save.
 *
 * ## A draft, not a switch per row that writes immediately
 *
 * The sheet has a **Save** button, which is legacy's shape and the right one here: the endpoint
 * takes the whole list in one `POST` (`[{ id, active }]`), so a toggle-writes-immediately design
 * would send every row's state on every tap — eleven switches flipped in a row means eleven
 * requests that each claim to be the complete truth, and the last one to land wins regardless of
 * the order they were sent in. One draft, one write.
 *
 * That is also what makes `isDirty` meaningful: the button is disabled until something actually
 * changed, so closing the sheet without a change cannot cost a request.
 *
 * ## Saving **resets** the list rather than invalidating it
 *
 * Turning a type off changes which rows the inbox returns, and the loaded pages are now a
 * numbered window over a *different* result set: page 2 of the old filter and page 2 of the new one
 * are not the same twenty notifications. Invalidating alone refetches every loaded page against the
 * new filter, which duplicates some rows and skips others — silently, because a list that keeps
 * paginating looks fine. So the cache is emptied to a single page and refetched from the top.
 *
 * ## The types are only fetched when the sheet opens
 *
 * `enabled` takes an `open` flag, so a reader who never touches the filter never pays for it —
 * the same reason `features/remote-config` has no provider. Legacy fetches on every open with no
 * cache at all; here the query's 60s `staleTime` means opening it twice is one request.
 */

export interface UseInboxTypesResult {
    /** The types as the server has them — `turn_on` is the **saved** state, not the draft. */
    types: InboxType[]
    isLoading: boolean
    isError: boolean
    /** The list came back and held nothing — the account has no configurable types. */
    isEmpty: boolean
    refetch: () => void
    /** Whether a given type is switched on **in the draft**. */
    isOn: (id: string) => boolean
    toggle: (id: string) => void
    /** The draft differs from what is saved. What the Save button is bound to. */
    isDirty: boolean
    isSaving: boolean
    /** Write the draft. A no-op when nothing changed. */
    save: () => void
}

/*
 * There is no `reset`. Closing the sheet discards the draft on its own — the `open` effect above
 * does it — so an exported one would be a second way to do the same thing, and the kind nothing
 * calls. It was there; the dialog never needed it.
 */

export function useInboxTypes({ open }: { open: boolean }): UseInboxTypesResult {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    const queryKey = useMemo(() => notificationKeys.types(activeId), [activeId])
    const inboxKey = useMemo(() => notificationKeys.inbox(activeId), [activeId])

    const query = useQuery({
        queryKey,
        queryFn: ({ signal }) => notificationApi.getTypes({ accountId: activeId, signal }),
        enabled: isAuthenticated && open,
    })

    const types = query.data ?? []

    /**
     * The draft, as **overrides**: only the rows the reader has actually touched.
     *
     * ## What this replaces, and the bug that made it necessary
     *
     * It used to be a `Set` of "ids that are on", seeded from the server by an effect, with `null`
     * meaning "not seeded yet". Two defects came out of that shape and they compounded:
     *
     * 1. `toggle` built the next set from `previous ?? []`, so toggling **while the draft was still
     *    `null`** produced a set containing only the id just pressed — every row that was on
     *    according to the server silently turned off. `isOn` fell back to `turn_on` while the draft
     *    was null, so the switches *looked* right up until the first press. Reported as: open the
     *    filter, switch Live Streaming on, and Money Updates turns itself off. It needed the sheet
     *    to have been opened once before — see the test file, which restores the old shape and
     *    records which of these two the reopen is.
     * 2. The seeding effect was keyed on a fingerprint of the saved state, so it re-ran only when
     *    the **server's** values changed. Closing the sheet set the draft back to `null`, but a
     *    query with a 60s `staleTime` still holds its data while disabled — so the fingerprint did
     *    not change, the effect never re-ran, and the draft stayed `null` for every reopen after the
     *    first. That is what made (1) reachable on essentially every use.
     *
     * Overrides have no un-seeded state, so neither defect is expressible: there is nothing to seed,
     * `toggle` never needs to know what else was on, and a row nobody has touched reads straight
     * through to the server's value. Pinned by `use-inbox-types.test.tsx`.
     *
     * It is also more correct on the case the old shape got wrong on purpose: a background refetch
     * that changes a row the reader has *not* touched is now picked up, instead of being either
     * ignored or allowed to wipe the whole draft.
     */
    const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map())

    /** Closing the sheet drops the draft, so re-opening it starts from what is saved. */
    useEffect(() => {
        if (open) return
        // Guarded so an already-empty map is not replaced on every unrelated render of a closed
        // sheet — `setState` with a fresh `Map` is always a new identity and would re-render.
        setOverrides(previous => (previous.size === 0 ? previous : new Map()))
    }, [open])

    /** What the server has for one row. */
    const saved = useCallback(
        (id: string) => types.find(type => type.id === id)?.turn_on ?? false,
        [types],
    )

    /** The override if the reader set one, else the server's value. */
    const isOn = useCallback((id: string) => overrides.get(id) ?? saved(id), [overrides, saved])

    /**
     * Flip one row.
     *
     * Reads through `isOn`, so it does not care whether this row — or any other — has been touched
     * before. That is the whole point of the shape: the old version had to reconstruct "everything
     * that is on" and got it wrong.
     */
    const toggle = useCallback(
        (id: string) => {
            setOverrides(previous => {
                const next = new Map(previous)
                const wanted = !(previous.get(id) ?? saved(id))
                /*
                 * Toggling back to the server's value **removes** the override rather than storing
                 * a matching one. Without this, `isDirty` would need to compare values instead of
                 * counting entries, and a reader who flips a switch twice would be offered an
                 * Apply that writes back exactly what is stored.
                 */
                if (wanted === saved(id)) next.delete(id)
                else next.set(id, wanted)
                return next
            })
        },
        [saved],
    )

    /** Only the rows that changed? No — the endpoint takes the whole list, so it gets it. */
    const payload: InboxSetting[] = types.map(type => ({ id: type.id, active: isOn(type.id) }))

    /**
     * Any override left standing is a real change — `toggle` deletes the ones that match the server
     * again — so this is a size check rather than a comparison over every row.
     *
     * Still scoped to rows the payload will carry: an override for an id the server has since
     * stopped returning must not enable Apply, or the reader is offered a write about a row that is
     * no longer on screen.
     */
    const isDirty = types.some(type => overrides.has(type.id))

    const saveMutation = useMutation({
        mutationFn: (settings: InboxSetting[]) => notificationApi.updateTypes(settings, activeId),
        onSuccess: async () => {
            /*
             * The saved state is asked for again rather than written from the draft. It is one
             * small request, and it is the only thing that can report a type the backend refused
             * to change — a grant it does not allow, a type that has been retired. Writing the
             * draft in would show the reader a switch in a position the server does not hold.
             */
            queryClient.invalidateQueries({ queryKey })
            // Reset, not invalidate — see the note at the top of this file.
            queryClient.setQueryData<NonNullable<InboxData>>(inboxKey, data => clearInbox(data))
            /*
             * And the stored validators with it: turning a type off changes *which rows* the list
             * returns, so a conditional GET answered 304 would repopulate the list with exactly
             * the notifications the reader just filtered out. See `forgetInboxCache` (**B72**).
             */
            await forgetInboxCache(activeId)
            queryClient.invalidateQueries({ queryKey: inboxKey })
            toast.success(t('notification_filter_saved'), { id: 'notification-action' })
        },
        meta: { showErrorToast: t('notification_error_filter_save') },
    })

    const save = useCallback(() => {
        if (!isDirty || saveMutation.isPending) return
        saveMutation.mutate(payload)
    }, [isDirty, payload, saveMutation])

    return {
        types,
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && types.length === 0,
        refetch: () => {
            query.refetch()
        },
        isOn,
        toggle,
        isDirty,
        isSaving: saveMutation.isPending,
        save,
    }
}
