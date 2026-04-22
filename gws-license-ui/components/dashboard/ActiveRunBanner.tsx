'use client'

import { useEffect, useState } from 'react'
import type { VerificationRun } from '@prisma/client'

interface Props {
  run: Pick<VerificationRun, 'id' | 'totalCount' | 'successCount' | 'errorCount' | 'manualCount'>
}

export function ActiveRunBanner({ run: initialRun }: Props) {
  const [run, setRun] = useState(initialRun)

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/runs/${run.id}`)
      if (res.ok) {
        const data = await res.json()
        setRun(data)
        if (data.status !== 'RUNNING') {
          clearInterval(interval)
          window.location.reload()
        }
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [run.id])

  const processed = run.successCount + run.errorCount + run.manualCount
  const pct = run.totalCount > 0 ? Math.round((processed / run.totalCount) * 100) : 0

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">
            Verification run in progress — {pct}% complete
          </p>
          <p className="text-xs text-blue-700">
            {processed.toLocaleString()} of {run.totalCount.toLocaleString()} licenses processed
            &nbsp;&middot;&nbsp;
            {run.errorCount} errors &nbsp;&middot;&nbsp;
            {run.manualCount} manual required
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-blue-200">
            <div
              className="h-2 rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
