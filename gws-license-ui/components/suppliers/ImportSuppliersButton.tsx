'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ImportSuppliersButton() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null)
  const router = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/suppliers/import', { method: 'POST', body: formData })
    if (res.ok) {
      const data = await res.json()
      setResult(data)
      router.refresh()
    } else {
      alert('Import failed. Check file format and try again.')
    }
    setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className="btn-secondary btn-sm"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {loading ? 'Importing…' : 'Import Excel/CSV'}
      </button>
      {result && (
        <span className="text-xs text-gray-500">
          {result.imported} imported, {result.errors} errors
        </span>
      )}
    </div>
  )
}
