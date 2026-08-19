import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AffiliatePreview } from './preview'

export const metadata: Metadata = { title: 'Affiliate', robots: { index: false, follow: false } }

export default function AffiliateDevPage() {
    // `/dev/*` is a development surface; it must not exist in production.
    if (process.env.NODE_ENV === 'production') notFound()
    return <AffiliatePreview />
}
