export default function Loading() {
    return (
        <div
            className="flex min-h-[var(--window-height)] items-center justify-center"
            aria-busy="true"
            aria-live="polite"
        >
            <span className="size-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <span className="sr-only">Đang tải…</span>
        </div>
    )
}
