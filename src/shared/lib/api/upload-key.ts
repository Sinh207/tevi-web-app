/**
 * Naming an object in the storage bucket, for every feature that uploads one.
 *
 * ## Why this is not in the feature that wrote it
 *
 * `uploadKey` and `fileExtension` started in `features/channel/lib/profile-form.ts`, next to the
 * avatar and cover fields that were the only uploaders. They belong here now for the reason
 * `shared/lib/api/upload-api.ts` implies: that file takes `key` as a **caller-chosen** argument and
 * documents nothing about its shape, so the shape is a cross-cutting API-layer fact with no home.
 * The second uploader (`features/post`'s composer) may not import `features/channel` — the
 * dependency between those two runs channel → post — so the alternative was a copy, and a copy of
 * this is worse than most: two features writing subtly different keys is invisible until someone
 * reads the bucket.
 *
 * `features/channel` re-exports both from `lib/profile-form.ts`, so its own call sites are unchanged.
 */

/**
 * The extension for an object key, from the blob's MIME type.
 *
 * `image/jpeg` → `jpg` and `video/quicktime` → `mov`, both because that is what the storage bucket
 * and every player expect to see. Anything unrecognised falls back to the subtype, and a blob with
 * no type at all falls back to `jpg` — legacy's behaviour, and the only wrong outcome it can produce
 * is an oddly-named object.
 */
export function fileExtension(file: Blob): string {
    const type = file.type
    if (!type) return 'jpg'
    const [kind, subtype = ''] = type.split('/')
    if (kind === 'image') return subtype === 'jpeg' ? 'jpg' : subtype || 'jpg'
    if (kind === 'video') return subtype === 'quicktime' ? 'mov' : subtype || 'mp4'
    return subtype || 'jpg'
}

/**
 * What kind of object a key names.
 *
 * `ct` thumb, `cc` cover, `ctv` thumb video — legacy's own abbreviations, kept because the bucket is
 * shared with a shipped app that writes them. `p` is a post image and is **this** client's, since
 * legacy never named a post object at all: its `POST v1/posts/image/upload-url/` takes an
 * `extension` and lets the *server* name the object (which is B104 — if that endpoint turns out to
 * be required for post media, this kind goes unused rather than wrong).
 */
export type UploadKind = 'ct' | 'cc' | 'ctv' | 'p'

/**
 * The storage object name — `{channelId}-{kind}-{timestamp}[-{index}].{ext}`, legacy's shape plus an
 * optional index.
 *
 * The timestamp is load-bearing rather than decorative: these URLs are served from a CDN, and an
 * avatar written to a stable key would keep serving the previous picture from every edge that still
 * had it cached. A changed image has to change its URL.
 *
 * **`index` is the other half of that, and it is not optional in practice for a multi-image post.**
 * Ten pictures picked in one gesture are keyed in the same tick, so `Date.now()` is identical across
 * all ten: without an index, ten uploads write to **one** object and nine of the reader's pictures
 * silently become the tenth. Nothing fails — the post is created, with the same picture ten times.
 * A profile upload passes no index because a channel has exactly one thumb and one cover.
 */
export function uploadKey(
    channelId: string,
    kind: UploadKind,
    extension: string,
    now: number = Date.now(),
    index?: number,
): string {
    const suffix = index === undefined ? '' : `-${index}`
    return `${channelId}-${kind}-${now}${suffix}.${extension}`
}
