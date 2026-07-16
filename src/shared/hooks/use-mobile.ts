'use client'

import { useEffect, useState } from 'react'

const MOBILE_MAX = 899 // < md (900px)
const TABLET_MAX = 1039 // < lg (1040px)

export type DeviceClass = 'desktop' | 'tablet' | 'mobile'

function classify(width: number): DeviceClass {
    if (width <= MOBILE_MAX) return 'mobile'
    if (width <= TABLET_MAX) return 'tablet'
    return 'desktop'
}

/**
 * Hydration-safe device class from viewport width. Seed with the server value
 * (`initial`) so the first client render matches SSR and there's no flash.
 */
export function useDeviceClass(initial: DeviceClass = 'desktop'): DeviceClass {
    const [device, setDevice] = useState<DeviceClass>(initial)

    useEffect(() => {
        const update = () => setDevice(classify(window.innerWidth))
        update()
        window.addEventListener('resize', update, { passive: true })
        return () => window.removeEventListener('resize', update)
    }, [])

    return device
}

export function useIsMobile(initial = false): boolean {
    const [isMobile, setIsMobile] = useState(initial)
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
        const update = () => setIsMobile(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])
    return isMobile
}
