'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LicensingAgency } from '@prisma/client'

interface Props {
  agency: LicensingAgency
}

export function EditAgencyButton({ agency }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(agency.websiteUrl)
  const [isBroken, setIsBroken] = useState(agency.isUrlBroken)
  const [isCaptcha, setIsCaptcha] = useState(agency.isCaptchaBlocked)
  const [notes, setNotes] = useState(agency.notes ?? '')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSave() {
    setLoading(true)
    const res = await fetch(`/api/agencies/${agency.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteUrl: url, isUrlBroken: isBroken, isCaptchaBlocked: isCaptcha, notes }),
    })
    if (res.ok) {
      setOpen(false)
      router.refresh()
    } else {
      alert('Failed to update agency.')
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary btn-sm">Edit</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-gray-900">{agency.name}</h2>
            <p className="mb-4 text-xs text-gray-500">{agency.state} &middot; {agency.crawlerKey}</p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Website URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="input"
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isBroken}
                    onChange={(e) => setIsBroken(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  URL Broken
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isCaptcha}
                    onChange={(e) => setIsCaptcha(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  CAPTCHA Blocked
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="input"
                  placeholder="Any relevant notes for the crawler team…"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={loading} className="btn-primary">
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
