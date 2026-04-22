import { db } from '@/lib/db'
import { RunStatusBadge } from '@/components/StatusBadge'
import { formatDateTime, formatRelative } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function VerificationsPage() {
  const runs = await db.verificationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verification Runs</h1>
        <p className="text-sm text-gray-500">All quarterly verification runs</p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="table-header">Run Date</th>
              <th className="table-header">Status</th>
              <th className="table-header">Triggered By</th>
              <th className="table-header">Total</th>
              <th className="table-header">Active</th>
              <th className="table-header">Failed</th>
              <th className="table-header">Manual</th>
              <th className="table-header">Errors</th>
              <th className="table-header">Duration</th>
              <th className="table-header"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.length === 0 && (
              <tr>
                <td colSpan={10} className="table-cell text-center text-gray-400 py-10">
                  No verification runs found. Start one from the Dashboard.
                </td>
              </tr>
            )}
            {runs.map((run) => {
              const duration =
                run.startedAt && run.completedAt
                  ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 60000)
                  : null

              return (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <p className="font-medium text-gray-900">{formatDateTime(run.createdAt)}</p>
                    <p className="text-xs text-gray-400">{formatRelative(run.createdAt)}</p>
                  </td>
                  <td className="table-cell">
                    <RunStatusBadge status={run.status} />
                  </td>
                  <td className="table-cell text-xs text-gray-500 capitalize">
                    {run.triggeredBy ?? 'manual'}
                  </td>
                  <td className="table-cell font-medium">{run.totalCount.toLocaleString()}</td>
                  <td className="table-cell text-green-700 font-medium">
                    {run.successCount.toLocaleString()}
                  </td>
                  <td className="table-cell text-red-700 font-medium">
                    {run.failedCount.toLocaleString()}
                  </td>
                  <td className="table-cell text-purple-700 font-medium">
                    {run.manualCount.toLocaleString()}
                  </td>
                  <td className="table-cell text-orange-700 font-medium">
                    {run.errorCount.toLocaleString()}
                  </td>
                  <td className="table-cell text-xs text-gray-500">
                    {duration !== null ? `${duration} min` : '—'}
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <Link href={`/verifications/${run.id}`} className="btn-secondary btn-sm">
                        View
                      </Link>
                      <a
                        href={`/api/runs/${run.id}/export`}
                        className="btn-secondary btn-sm"
                        title="Export to Excel"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
