import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names then de-dupe conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

const compactFormatter = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
})

/** 1_500 → "1.5k". Locale-aware compact number. */
export function formatCount(n: number | null | undefined) {
    return compactFormatter.format(n ?? 0).toLowerCase()
}
