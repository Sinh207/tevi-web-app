'use client'

import { useEffect } from 'react'

/** Catches errors in the root layout itself (renders its own <html>). */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <html lang="en">
            <body
                style={{
                    display: 'flex',
                    minHeight: '100vh',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 16,
                    fontFamily: 'system-ui, sans-serif',
                }}
            >
                <h1>Something went wrong</h1>
                <button type="button" onClick={reset}>
                    Try again
                </button>
            </body>
        </html>
    )
}
