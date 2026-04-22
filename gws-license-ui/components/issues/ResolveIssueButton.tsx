'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VerificationStatus } from '@/lib/utils'

interface Props {
  issueId: string
  supplierId: string
  agencyId: string
  isUrlBroken: boolean
}

export function ResolveIssueButton({ issueId, supplierId, agencyId, isUrlBroken }: Props) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<VerificationStatus>('ACTIVE')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [terminationDate, setTerminationDate] = useState('')
  const [correctedUrl, setCorrectedUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleResolve() {
    setLoading(true)
    const res = await fetch(`/api/issues/${issueId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, effectiveDate, terminationDate, correctedUrl }),
    })
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      alert('Failed to resolve issue.')
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary btn-sm">
        Resolve
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Resolve Manual Issue</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Verified Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VerificationStatus)}
                  className="select"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="TERMINATED">Terminated</option>
                  <option value="NOT_FOUND">Not Found</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Termination Date
                  </label>
                  <input
                    type="date"
                    value={terminationDate}
                    onChange={(e) => setTerminationDate(e.target.value)}
                    className="input"
                  />
                </div>
              </div>

              {isUrlBroken && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Corrected Agency URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://…"
                    value={correctedUrl}
                    onChange={(e) => setCorrectedUrl(e.target.value)}
                    className="input"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    This will update the agency record for future runs.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleResolve} disabled={loading} className="btn-primary">
                {loading ? 'Saving…' : 'Save Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
