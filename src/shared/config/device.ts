import 'server-only'
import { headers } from 'next/headers'

export type DeviceClass = 'desktop' | 'tablet' | 'mobile'

const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview/i
const TABLET_RE = /ipad|tablet|(android(?!.*mobile))|playbook|silk/i
const MOBILE_RE = /iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini/i

/** Server-side device classification from the request UA. Bots → desktop (SEO). */
export async function getDeviceClass(): Promise<DeviceClass> {
    const ua = (await headers()).get('user-agent') ?? ''
    if (BOT_RE.test(ua)) return 'desktop'
    if (TABLET_RE.test(ua)) return 'tablet'
    if (MOBILE_RE.test(ua)) return 'mobile'
    return 'desktop'
}
