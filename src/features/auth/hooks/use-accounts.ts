'use client'

import { getServerSnapshot, getSnapshot, subscribe } from '@shared/lib/api/token'
import { useSyncExternalStore } from 'react'

/** Reactive view of the multi-account token store. */
export function useAccounts() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
