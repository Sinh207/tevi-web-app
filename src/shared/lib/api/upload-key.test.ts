import { describe, expect, it } from 'vitest'
import { fileExtension, uploadKey } from './upload-key'

describe('fileExtension', () => {
    it('maps the two types the bucket and players expect to see spelled a particular way', () => {
        expect(fileExtension(new Blob([], { type: 'image/jpeg' }))).toBe('jpg')
        expect(fileExtension(new Blob([], { type: 'video/quicktime' }))).toBe('mov')
    })

    it('falls back to the subtype, and to jpg for a blob with no type at all', () => {
        expect(fileExtension(new Blob([], { type: 'image/webp' }))).toBe('webp')
        expect(fileExtension(new Blob([], { type: 'image/png' }))).toBe('png')
        expect(fileExtension(new Blob([]))).toBe('jpg')
    })
})

describe('uploadKey', () => {
    it('builds legacy’s shape, with the timestamp that keeps a CDN edge from serving the old bytes', () => {
        expect(uploadKey('ch1', 'ct', 'jpg', 1700000000000)).toBe('ch1-ct-1700000000000.jpg')
        expect(uploadKey('ch1', 'cc', 'png', 1700000000000)).toBe('ch1-cc-1700000000000.png')
        expect(uploadKey('ch1', 'ctv', 'mp4', 1700000000000)).toBe('ch1-ctv-1700000000000.mp4')
    })

    it('omits the index when there is none — a channel has one thumb and one cover', () => {
        expect(uploadKey('ch1', 'ct', 'jpg', 1700000000000)).not.toContain('-undefined')
    })

    /**
     * The case this parameter exists for: ten pictures picked in one gesture share a tick, so
     * without an index all ten keys are identical, ten uploads overwrite one object, and nine of
     * the reader's pictures silently become the tenth. Nothing throws — the post is created with
     * the same image ten times.
     */
    it('distinguishes images keyed in the same millisecond', () => {
        const now = 1700000000000
        const keys = [0, 1, 2].map(index => uploadKey('ch1', 'p', 'jpg', now, index))

        expect(keys).toEqual([
            'ch1-p-1700000000000-0.jpg',
            'ch1-p-1700000000000-1.jpg',
            'ch1-p-1700000000000-2.jpg',
        ])
        expect(new Set(keys).size).toBe(3)
    })

    it('keeps index 0, which a falsy check would drop and collide with the un-indexed key', () => {
        expect(uploadKey('ch1', 'p', 'jpg', 1700000000000, 0)).toBe('ch1-p-1700000000000-0.jpg')
    })
})
