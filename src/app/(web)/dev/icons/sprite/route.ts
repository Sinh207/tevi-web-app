import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Serves the full 60 MB design-system sprite to the dev gallery only.
 *
 * It deliberately does not live in `public/` — shipping it would put the whole
 * icon set in the deployment for the sake of one dev page, and the app itself
 * only ever loads the hashed subset from `scripts/build-icon-sprite.mjs`.
 */
export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return new Response('Not found', { status: 404 })
    }

    const sprite = await readFile(join(process.cwd(), 'design-system/tevi-icons.svg'))
    return new Response(new Uint8Array(sprite), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
    })
}
