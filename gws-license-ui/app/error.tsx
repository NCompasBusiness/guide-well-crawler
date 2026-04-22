'use client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-xl rounded-lg border border-red-200 bg-red-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-900">Something went wrong</h2>
        <pre className="whitespace-pre-wrap break-words text-sm text-red-800">{error.message}</pre>
        {error.digest && <p className="mt-2 text-xs text-red-700">digest: {error.digest}</p>}
        <button onClick={reset} className="mt-4 rounded bg-red-600 px-3 py-1 text-sm text-white">
          Try again
        </button>
      </div>
    </div>
  )
}
