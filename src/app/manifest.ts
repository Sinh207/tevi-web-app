import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Tevi',
        short_name: 'Tevi',
        description: 'A monetization platform for content creators.',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#501BC0',
        icons: [{ src: '/icon.png', sizes: 'any', type: 'image/png' }],
    }
}
