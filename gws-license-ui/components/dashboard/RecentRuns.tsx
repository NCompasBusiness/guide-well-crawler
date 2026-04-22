import Link from 'next/link'
import { formatRelative } from '@/lib/utils'
import { RunStatusBadge } from '@/components/StatusBadge'
import type { RunStatus } from '@/lib/utils'

interface Run {
  id: string
  status: RunStatus
  createdAt: Date
  completedAt: Date | null
  totalCount: number
  successCount: number
  failedCount: number
  manualCount: number
  errorCount: number
  triggeredBy: string | null
}

export function RecentRuns({ runs }: { runs: Run[] }) {
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Recent Runs</h2>
        <Link href="/verifications" className="text-sm text-brand-600 hover:text-brand-700">
          View all →
        </Link>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-gray-400">No runs yet</p>
      ) : (
        <div className="divide-y">
          {runs.map((run) => {
            const pct = run.totalCount > 0
              ? Math.round((run.successCount / run.totalCount) * 100)
              : 0
            return (
              <Link
                key={run.id}
                href={`/verifications/${run.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs text-gray-400">
                      {run.triggeredBy === 'scheduler' ? 'Scheduled' : 'Manual'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatRelative(run.createdAt)} &middot; {run.totalCount.toLocaleString()} licenses
                  </p>
                </div>
                <div className="ml-4 text-right">
                  <p className="text-sm font-semibold text-gray-900">{pct}%</p>
                  <p className="text-xs text-gray-400">success</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
