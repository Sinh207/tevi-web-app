/**
 * ffmpeg, compiled to WebAssembly, for the one job this app gives it: **cutting a clip**.
 *
 * ## Why the work happens in the browser at all
 *
 * The upload contract takes a file and its measurements; it has no "start here, end there" field,
 * so a trim the backend performed is not something this client can ask for. The bytes have to be
 * cut before they are sent, and ffmpeg.wasm is what legacy uses to do it.
 *
 * ## Legacy's 0.11, and **its prebuilt bundle** rather than its source
 *
 * Two versions were tried before this one, and both failed at the bundler rather than at runtime —
 * worth writing down, because neither failure is visible until a route 500s or a dialog hangs.
 *
 * - **0.12** could not be used at all. Its worker is an ES module, so `importScripts` is
 *   unavailable and it falls through to `await import(_coreURL)` — a **dynamic expression**, which
 *   Turbopack refuses to bundle and replaces with a throw: *"Cannot find module as expression is
 *   too dynamic"*. The trimmer reached *Save* and then failed with nothing in the network panel.
 * - **0.11's ESM entry** breaks the build a step earlier. `src/browser/defaultOptions.js` evaluates
 *   `new URL('/node_modules/@ffmpeg/core/dist/ffmpeg-core.js', import.meta.url)` at **module
 *   scope**, which Turbopack tries to resolve as a static asset; the dev server answered 500 for
 *   the whole route, not just for this feature.
 *
 * So the import below points at `dist/ffmpeg.min.js`, the package's **prebuilt UMD bundle**. It
 * carries no `/node_modules/` path, and it loads the core in the *main thread* with
 * `document.createElement('script')` — which `'strict-dynamic'` permits, because the script doing
 * the creating already carries the nonce.
 *
 * ⚠ Its built-in default `corePath` is a **unpkg.com** URL. `corePath` and `wasmPath` are therefore
 * not optional here: omit them and the shipped app fetches its executable core from a third party
 * this repo does not otherwise talk to.
 *
 * ## `-c copy`, which is the difference between a second and a minute
 *
 * The cut is a **stream copy**: the container is rewritten around the chosen range and not one
 * frame is re-encoded. That keeps the codec, the quality and the bitrate exactly as the author
 * recorded them, and it is why a trim finishes in about the time it takes to read the file rather
 * than in the minutes a wasm H.264 encode would take.
 *
 * It costs precision, and the cost is worth naming: a stream copy can only start on a **keyframe**,
 * so the real start can land up to a group-of-pictures earlier than the handle was dropped —
 * typically under two seconds. `-avoid_negative_ts make_zero` is what stops that becoming a clip
 * whose first frames carry negative timestamps and which some players then refuse.
 *
 * ## One instance, and it is disposable
 *
 * The core is 24 MB. It loads once per tab and is kept, because a reader who trims one clip often
 * trims another — but `resetFfmpeg()` exists because 0.11 offers no way to cancel a `run()` that is
 * already going: the only way out is to throw the whole instance away. The trimmer calls it on
 * unmount.
 *
 * ## Single-thread, deliberately
 *
 * The multi-thread core needs `SharedArrayBuffer`, which needs cross-origin isolation, which needs
 * `COEP: require-corp` — and that header blocks every cross-origin image this product renders.
 * `scripts/copy-ffmpeg-core.mjs` has the full account.
 *
 * The policy has to agree as well: `'wasm-unsafe-eval'` and `worker-src blob:` in
 * `shared/config/csp.ts`. Without either, everything below fails with a console violation and no
 * other symptom.
 */

/** Where `scripts/copy-ffmpeg-core.mjs` puts the core. Same origin, so `connect-src 'self'` covers it. */
const CORE_PATH = '/ffmpeg/ffmpeg-core.js'
const WASM_PATH = '/ffmpeg/ffmpeg-core.wasm'

/**
 * The slice of `@ffmpeg/ffmpeg` 0.11 this module uses.
 *
 * Declared here rather than imported, because the import is the **UMD bundle** and carries no
 * declarations of its own — and because the dynamic import is the point: a visitor who never trims
 * anything downloads none of it. Narrow on purpose, so a version bump that changes one of these
 * five members is a type error here rather than a failure inside a worker.
 */
interface FfmpegInstance {
    isLoaded(): boolean
    load(): Promise<void>
    run(...args: string[]): Promise<void>
    FS(method: 'writeFile', path: string, data: Uint8Array): void
    FS(method: 'readFile', path: string): Uint8Array
    FS(method: 'unlink', path: string): void
    exit?(): void
}

type FetchFile = (input: File | Blob | string) => Promise<Uint8Array>

interface FfmpegModule {
    createFFmpeg(options: {
        corePath: string
        wasmPath?: string
        /** The core's entry symbol. The single-thread build exports `main`. */
        mainName?: string
        log?: boolean
    }): FfmpegInstance
    fetchFile: FetchFile
}

let instance: FfmpegInstance | null = null
let fetchFileFn: FetchFile | null = null
let loading: Promise<void> | null = null

/**
 * The loaded instance, creating and loading it on first use.
 *
 * `loading` is a shared promise rather than a boolean: two trims started in the same tick would
 * otherwise both see `isLoaded() === false` and both call `load()`, and the second `load()` on a
 * 0.11 instance rejects. One flight, many awaiters — the same shape `shared/lib/api/client.ts` uses
 * for a token refresh.
 */
export async function loadFfmpeg(): Promise<{ ffmpeg: FfmpegInstance; fetchFile: FetchFile }> {
    if (typeof window === 'undefined') throw new Error('ffmpeg is browser-only')

    if (!instance) {
        /* The prebuilt bundle, for the bundler reasons in this file's header. */
        /*
         * `unknown` from the ambient declaration, narrowed here. UMD under an ESM loader lands
         * either on the namespace or on `default` depending on how the bundler interops it, and a
         * cast that assumed one would fail as `createFFmpeg is not a function` at the first trim.
         */
        const mod = await import('@ffmpeg/ffmpeg/dist/ffmpeg.min.js')
        const candidate = mod as unknown as Record<string, unknown>
        const api = (
            typeof candidate.createFFmpeg === 'function' ? candidate : candidate.default
        ) as FfmpegModule
        if (typeof api?.createFFmpeg !== 'function')
            throw new Error('ffmpeg bundle has no createFFmpeg')

        const origin = window.location.origin
        instance = api.createFFmpeg({
            // Absolute, because the core resolves its own siblings against whatever it was given.
            corePath: new URL(CORE_PATH, origin).toString(),
            wasmPath: new URL(WASM_PATH, origin).toString(),
            /*
             * ⚠ The single-thread core's entry point is `main`, not the default `proxy_main`, and
             * **no `workerPath`**. 0.11 otherwise derives one by string-replacing the core's name,
             * asks for `/ffmpeg/ffmpeg-core.worker.js` — which `@ffmpeg/core-st` does not ship —
             * and takes a 404 on every load. Legacy's ST branch passes exactly this pair.
             */
            mainName: 'main',
            log: false,
        })
        fetchFileFn = api.fetchFile
    }

    if (!instance.isLoaded()) {
        loading ??= instance.load()
        try {
            await loading
        } finally {
            loading = null
        }
    }

    if (!fetchFileFn) throw new Error('ffmpeg loaded without fetchFile')
    return { ffmpeg: instance, fetchFile: fetchFileFn }
}

/**
 * Throw the instance away.
 *
 * The **only** way to stop a `run()` that is already going: 0.11 exposes no abort, and the core
 * will otherwise keep decoding after the dialog that started it has closed. `exit()` is wrapped
 * because it throws when the instance was never loaded, and a cleanup path that can throw is a
 * cleanup path that skips whatever came after it.
 */
export function resetFfmpeg(): void {
    try {
        instance?.exit?.()
    } catch {
        // Already gone, or never started. Either way there is nothing to stop.
    }
    instance = null
    fetchFileFn = null
    loading = null
}

export interface TrimRequest {
    file: File | Blob
    startSeconds: number
    durationSeconds: number
}

/**
 * Cut `[start, start + duration)` out of a clip and answer the result as an MP4 `File`.
 *
 * Throws on any failure — the caller decides what the reader is told. Note the argument order:
 * `-ss` sits **before** `-i`, which makes ffmpeg seek the input rather than decode up to the mark
 * and discard. On a wasm build that is the difference between a trim and a hang.
 */
export async function trimVideo({
    file,
    startSeconds,
    durationSeconds,
}: TrimRequest): Promise<File> {
    const { ffmpeg, fetchFile } = await loadFfmpeg()

    const input = 'input.mp4'
    const output = 'output.mp4'

    try {
        ffmpeg.FS('writeFile', input, await fetchFile(file))
        await ffmpeg.run(
            '-ss',
            Math.max(0, startSeconds).toFixed(3),
            '-i',
            input,
            '-t',
            Math.max(0.1, durationSeconds).toFixed(3),
            '-avoid_negative_ts',
            'make_zero',
            '-c',
            'copy',
            output,
        )

        const data = ffmpeg.FS('readFile', output)
        /*
         * The type is the **source's** where there is one. A QuickTime file stream-copied into an
         * MP4 container is still what its own codec says it is, and the caller re-measures the
         * result before trusting it — so a container the browser will not decode is caught at the
         * composer rather than at the upload.
         */
        return new File([data.buffer as ArrayBuffer], 'trimmed.mp4', {
            type: file.type || 'video/mp4',
            lastModified: Date.now(),
        })
    } finally {
        /*
         * The virtual filesystem is the instance's, so an input left behind is the whole clip held
         * in its heap until the tab closes. Each unlink is its own try: the output does not exist
         * when `run` failed, and one throw here would skip the other.
         */
        for (const name of [input, output]) {
            try {
                ffmpeg.FS('unlink', name)
            } catch {
                // Never written, or already gone.
            }
        }
    }
}
