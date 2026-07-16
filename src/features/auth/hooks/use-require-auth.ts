'use client'

import { useCallback } from 'react'
import { useAuth } from '../providers/auth-provider'
import { useAuthStore } from '../store/auth-store'

/**
 * Guard a callback behind authentication. If the user is not authenticated,
 * opens the login dialog instead of running the action.
 */
export function useRequireAuth() {
    const { isAuthenticated } = useAuth()
    const openDialog = useAuthStore(s => s.openDialog)

    return useCallback(
        <A extends unknown[]>(cb: (...args: A) => void) =>
            (...args: A) => {
                if (!isAuthenticated) {
                    openDialog('login')
                    return
                }
                cb(...args)
            },
        [isAuthenticated, openDialog],
    )
}
