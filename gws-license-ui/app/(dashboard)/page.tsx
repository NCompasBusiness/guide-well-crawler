import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { RecentRuns } from '@/components/dashboard/RecentRuns'
import { RunStatusChart } from '@/components/dashboard/RunStatusChart'
import { ActiveRunBanner } from '@/components/dashboard/ActiveRunBanner'
import { StartRunButton } from '@/components/dashboard/StartRunButton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  const [
    totalSuppliers,
    activeSuppliers,
    unresolvedIssues,
    latestRun,
    recentRuns,
    activeRun,
  ] = await Promise.all([
    db.supplier.count({ where: { isActive: true } }),
    db.supplier.count({ where: { isActive: true, lastStatus: 'ACTIVE' } }),
    db.licenseVerification.count({ where: { requiresManual: true, manualResolvedAt: null } }),
    db.verificationRun.findFirst({ orderBy: { createdAt: 'desc' } }),
    db.verificationRun.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, createdAt: true, completedAt: true,
        totalCount: true, successCount: true, failedCount: true,
        manualCount: true, errorCount: true, triggeredBy: true,
      },
    }),
    db.verificationRun.findFirst({ where: { status: 'RUNNING' } }),
  ])

  // Status breakdown from latest completed run
  let statusBreakdown: { status: string; count: number }[] = []
  if (latestRun) {
    const grouped = await db.licenseVerification.groupBy({
      by: ['status'],
      where: { runId: latestRun.id },
      _count: { status: true },
    })
    statusBreakdown = grouped.map((g) => ({ status: g.status, count: g._count.status }))
  }

  const canTriggerRun = session?.user.role === 'ADMIN' || session?.user.role === 'OPERATOR'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">DME Supplier License Verification Overview</p>
        </div>
        {canTriggerRun && <StartRunButton hasActiveRun={!!activeRun} />}
      </div>

      {activeRun && <ActiveRunBanner run={activeRun} />}

      {unresolvedIssues > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <svg className="h-5 w-5 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-800">
            <strong>{unresolvedIssues} items</strong> require manual review from the latest run.{' '}
            <a href="/issues" className="font-semibold underline">View issues →</a>
          </p>
        </div>
      )}

      <StatsCards
        totalSuppliers={totalSuppliers}
        activeSuppliers={activeSuppliers}
        unresolvedIssues={unresolvedIssues}
        latestRun={latestRun}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RunStatusChart data={statusBreakdown} runDate={latestRun?.completedAt ?? null} />
        <RecentRuns runs={recentRuns} />
      </div>
    </div>
  )
}
