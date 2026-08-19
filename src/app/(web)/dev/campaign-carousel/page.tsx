import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CampaignCarouselPreview } from './preview'

export const metadata: Metadata = {
    title: 'Campaign carousel',
    robots: { index: false, follow: false },
}

export default function CampaignCarouselDevPage() {
    // `/dev/*` is a development surface; it must not exist in production.
    if (process.env.NODE_ENV === 'production') notFound()
    return <CampaignCarouselPreview />
}
