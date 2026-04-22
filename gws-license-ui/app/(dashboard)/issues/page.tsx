import { db } from '@/lib/db'
import { VerificationBadge } from '@/components/StatusBadge'
import { formatDateTime, manualReasonLabel } from '@/lib/utils'
import { ResolveIssueButton } from '@/components/issues/ResolveIssueButton'
import { IssueFilters } from '@/components/issues/IssueFilters'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface SearchParams {
  resolved?: string
  reason?: string
  runId?: string
}

export default async function IssuesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions)
  const canResolve = session?.user.role === 'ADMIN' || session?.user.role === 'OPERATOR'

  const showResolved = searchParams.resolved === 'true'

  const where = {
    requiresManual: true,
    ...(showResolved ? {} : { manualResolvedAt: null }),
    ...(searchParams.reason && { manualReason: searchParams.reason as any }),
    ...(searchParams.runId && { runId: searchParams.runId }),
  }

  const [issues, recentRuns] = await Promise.all([
    db.licenseVerification.findMany({
      where,
      orderBy: { verifiedAt: 'desc' },
      take: 200,
      include: {
        supplier: {
          include: { agency: { select: { id: true, name: true, websiteUrl: true } } },
        },
        run: { select: { id: true, createdAt: true } },
      },
    }),
    db.verificationRun.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    }),
  ])

  const unresolvedCount = await db.licenseVerification.count({
    where: { requiresManual: true, manualResolvedAt: null },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Issues</h1>
        <p className="text-sm text-gray-500">
          {unresolvedCount} unresolved items requiring manual verification
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <a
            href={`/issues${showResolved ? '' : '?resolved=true'}`}
            className={`btn-sm ${showResolved ? 'btn-primary' : 'btn-secondary'}`}
          >
            {showResolved ? 'Showing All' : 'Show Resolved'}
          </a>
          <IssueFilters runs={recentRuns} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="table-header">Supplier</th>
              <th className="table-header">License #</th>
              <th className="table-header">State</th>
              <th className="table-header">Agency</th>
              <th className="table-header">Reason</th>
              <th className="table-header">Error</th>
              <th className="table-header">Run Date</th>
              <th className="table-header">Resolution</th>
              {canResolve && <th className="table-header">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {issues.length === 0 && (
              <tr>
                <td colSpan={canResolve ? 9 : 8} className="table-cell text-center text-gray-400 py-10">
                  No issues found
                </td>
              </tr>
            )}
            {issues.map((issue) => (
              <tr key={issue.id} className={issue.manualResolvedAt ? 'opacity-60' : ''}>
                <td className="table-cell font-medium text-gray-900 max-w-[200px] truncate">
                  {issue.supplier.supplierName}
                </td>
                <td className="table-cell font-mono text-xs">{issue.supplier.licenseNumber}</td>
                <td className="table-cell">
                  <span className="badge bg-gray-100 text-gray-700">{issue.supplier.state}</span>
                </td>
                <td className="table-cell text-xs text-gray-500 max-w-[160px]">
                  <p className="truncate">{issue.supplier.agency.name}</p>
                  <a
                    href={issue.supplier.agency.websiteUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-brand-600 hover:underline"
                  >
                    Open site ↗
                  </a>
                </td>
                <td className="table-cell">
                  <span className="badge bg-purple-100 text-purple-800">
                    {manualReasonLabel(issue.manualReason)}
                  </span>
                </td>
                <td className="table-cell text-xs text-red-600 max-w-[200px] truncate">
                  {issue.errorMessage ?? '—'}
                </td>
                <td className="table-cell text-xs text-gray-500">
                  {formatDateTime(issue.run.createdAt)}
                </td>
                <td className="table-cell text-xs">
                  {issue.manualResolvedAt ? (
                    <div>
                      <VerificationBadge status={issue.status} />
                      <p className="mt-0.5 text-gray-400">
                        {formatDateTime(issue.manualResolvedAt)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-gray-400">Pending</span>
                  )}
                </td>
                {canResolve && (
                  <td className="table-cell">
                    {!issue.manualResolvedAt && (
                      <ResolveIssueButton
                        issueId={issue.id}
                        supplierId={issue.supplier.id}
                        agencyId={issue.supplier.agency.id}
                        isUrlBroken={issue.manualReason === 'BROKEN_URL'}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
