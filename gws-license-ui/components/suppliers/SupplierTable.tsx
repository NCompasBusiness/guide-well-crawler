'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { VerificationBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/utils'
import type { VerificationStatus } from '@/lib/utils'

interface Supplier {
  id: string
  supplierName: string
  licenseNumber: string
  licenseType: string
  state: string
  lastStatus: VerificationStatus | null
  lastVerifiedAt: Date | null
  agency: { name: string; state: string }
}

interface Agency { id: string; name: string; state: string }

interface Props {
  suppliers: Supplier[]
  total: number
  page: number
  perPage: number
  agencies: Agency[]
  searchParams: Record<string, string | undefined>
  canEdit: boolean
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

const STATUS_OPTIONS: VerificationStatus[] = [
  'ACTIVE','EXPIRED','TERMINATED','NOT_FOUND','ERROR','MANUAL_REQUIRED','PENDING'
]

export function SupplierTable({ suppliers, total, page, perPage, agencies, searchParams, canEdit }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const updateParam = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(params.toString())
    if (value) p.set(key, value); else p.delete(key)
    p.delete('page')
    router.push(`${pathname}?${p.toString()}`)
  }, [params, pathname, router])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input
            type="search"
            placeholder="Search name or license #…"
            defaultValue={searchParams.search}
            onChange={(e) => updateParam('search', e.target.value)}
            className="input col-span-2 sm:col-span-1"
          />
          <select
            defaultValue={searchParams.state ?? ''}
            onChange={(e) => updateParam('state', e.target.value)}
            className="select"
          >
            <option value="">All States</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            defaultValue={searchParams.status ?? ''}
            onChange={(e) => updateParam('status', e.target.value)}
            className="select"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            defaultValue={searchParams.agencyId ?? ''}
            onChange={(e) => updateParam('agencyId', e.target.value)}
            className="select"
          >
            <option value="">All Agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.state} — {a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="table-header">Supplier Name</th>
                <th className="table-header">License #</th>
                <th className="table-header">Type</th>
                <th className="table-header">State</th>
                <th className="table-header">Agency</th>
                <th className="table-header">Status</th>
                <th className="table-header">Last Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-cell text-center text-gray-400 py-8">
                    No suppliers found
                  </td>
                </tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-900 max-w-xs truncate">
                    {s.supplierName}
                  </td>
                  <td className="table-cell font-mono text-xs">{s.licenseNumber}</td>
                  <td className="table-cell text-xs text-gray-500">{s.licenseType}</td>
                  <td className="table-cell">
                    <span className="badge bg-gray-100 text-gray-700">{s.state}</span>
                  </td>
                  <td className="table-cell text-xs text-gray-500 max-w-[180px] truncate">
                    {s.agency.name}
                  </td>
                  <td className="table-cell">
                    {s.lastStatus ? (
                      <VerificationBadge status={s.lastStatus} />
                    ) : (
                      <span className="text-xs text-gray-400">Never verified</span>
                    )}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {formatDate(s.lastVerifiedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-sm text-gray-500">
            {((page - 1) * perPage + 1).toLocaleString()}–{Math.min(page * perPage, total).toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => updateParam('page', String(page - 1))}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => updateParam('page', String(page + 1))}
              className="btn-secondary btn-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
