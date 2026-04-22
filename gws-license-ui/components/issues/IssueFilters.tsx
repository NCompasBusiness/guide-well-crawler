'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'

interface Run {
  id: string
  createdAt: Date | string
}

const REASONS = [
  'CAPTCHA_REQUIRED',
  'BROKEN_URL',
  'PASSWORD_PROTECTED',
  'COMPLEX_NAVIGATION',
  'SITE_UNAVAILABLE',
  'OTHER',
]

export function IssueFilters({ runs }: { runs: Run[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    router.push(`/issues?${p.toString()}`)
  }

  return (
    <>
      <select
        className="select w-auto"
        defaultValue={searchParams.get('reason') ?? ''}
        onChange={(e) => updateParam('reason', e.target.value)}
      >
        <option value="">All Reasons</option>
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <select
        className="select w-auto"
        defaultValue={searchParams.get('runId') ?? ''}
        onChange={(e) => updateParam('runId', e.target.value)}
      >
        <option value="">All Runs</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {format(new Date(r.createdAt), 'yyyy-MM-dd')}
          </option>
        ))}
      </select>
    </>
  )
}
