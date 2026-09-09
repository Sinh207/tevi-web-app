'use client'

/** Throws during render, which is what `app/error.tsx` is there to catch. */
export function Boom(): never {
    throw new Error('dev harness: a deliberate render error')
}
