import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { RunStatusBadge, VerificationBadge } from '@/components/StatusBadge'
import { formatDateTime, formatDate, manualReasonLabel } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function RunDetailPage({ params }: { params: { runId: string } }) {
  const run = await db.verificationRun.findUnique({
    where: { id: params.runId },
    include: {
      verifications: {
        include: {
          supplier: {
            include: { agency: { select: { name: true } } },
          },
        },
        orderBy: { verifiedAt: 'desc' },
      },
    },
  })

  if (!run) notFound()

  const duration =
    run.startedAt && run.completedAt
      ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 60000)
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/verifications" className="text-sm text-gray-500 hover:text-gray-700">
          ← Verification Runs
        </Link>
      </div>

      {/* Run summary */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                Run {formatDateTime(run.createdAt)}
              </h1>
              <RunStatusBadge status={run.status} />
            </div>
            {run.notes && <p className="mt-1 text-sm text-gray-500">{run.notes}</p>}
          </div>
          <a href={`/api/runs/${run.id}/export`} className="btn-secondary">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Results
          </a>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-6">
          {[
            { label: 'Total', value: run.totalCount, color: 'text-gray-900' },
            { label: 'Active', value: run.successCount, color: 'text-green-700' },
            { label: 'Failed', value: run.failedCount, color: 'text-red-700' },
            { label: 'Manual', value: run.manualCount, color: 'text-purple-700' },
            { label: 'Errors', value: run.errorCount, color: 'text-orange-700' },
            { label: 'Duration', value: duration !== null ? `${duration}m` : '—', color: 'text-gray-700' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-gray-50 p-3 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{String(stat.value)}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Results table */}
      <div className="card overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Results ({run.verifications.length.toLocaleString()})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="table-header">Supplier</th>
                <th className="table-header">License #</th>
                <th className="table-header">State</th>
                <th className="table-header">Agency</th>
                <th className="table-header">Status</th>
                <th className="table-header">Effective</th>
                <th className="table-header">Terminates</th>
                <th className="table-header">Issue</th>
                <th className="table-header">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {run.verifications.map((v) => (
                <tr key={v.id} className={v.requiresManual ? 'bg-purple-50' : 'hover:bg-gray-50'}>
                  <td className="table-cell font-medium text-gray-900 max-w-[200px] truncate">
                    {v.supplier.supplierName}
                  </td>
                  <td className="table-cell font-mono text-xs">{v.supplier.licenseNumber}</td>
                  <td className="table-cell">
                    <span className="badge bg-gray-100 text-gray-700">{v.supplier.state}</span>
                  </td>
                  <td className="table-cell text-xs text-gray-500 max-w-[140px] truncate">
                    {v.supplier.agency.name}
                  </td>
                  <td className="table-cell">
                    <VerificationBadge status={v.status} />
                  </td>
                  <td className="table-cell text-xs">{formatDate(v.effectiveDate)}</td>
                  <td className="table-cell text-xs">{formatDate(v.terminationDate)}</td>
                  <td className="table-cell text-xs text-purple-700">
                    {v.manualReason ? manualReasonLabel(v.manualReason) : ''}
                  </td>
                  <td className="table-cell text-xs text-red-600 max-w-[200px] truncate">
                    {v.errorMessage ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
