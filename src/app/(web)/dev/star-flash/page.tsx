import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { StarFlashPreview } from './preview'

export const metadata: Metadata = { title: 'Star flash', robots: { index: false, follow: false } }

export default function StarFlashDevPage() {
    if (process.env.NODE_ENV === 'production') notFound()
    return <StarFlashPreview />
}
