'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function StartRunButton({ hasActiveRun }: { hasActiveRun: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleStart() {
    if (!confirm('Start a new verification run for all active suppliers?')) return
    setLoading(true)
    const res = await fetch('/api/runs', { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      alert('Failed to start run. Please try again.')
    }
    setLoading(false)
  }

  if (hasActiveRun) {
    return (
      <button disabled className="btn-primary opacity-50">
        Run in Progress…
      </button>
    )
  }

  return (
    <button onClick={handleStart} disabled={loading} className="btn-primary">
      {loading ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Starting…
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Start Verification Run
        </>
      )}
    </button>
  )
}
