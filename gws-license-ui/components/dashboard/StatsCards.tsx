import { formatRelative } from '@/lib/utils'
import type { VerificationRun } from '@prisma/client'

interface Props {
  totalSuppliers: number
  activeSuppliers: number
  unresolvedIssues: number
  latestRun: VerificationRun | null
}

export function StatsCards({ totalSuppliers, activeSuppliers, unresolvedIssues, latestRun }: Props) {
  const expired = latestRun ? latestRun.failedCount : 0
  const errors = latestRun ? latestRun.errorCount : 0

  const cards = [
    {
      label: 'Total Suppliers',
      value: totalSuppliers.toLocaleString(),
      sub: 'Active in system',
      color: 'text-brand-600',
      bg: 'bg-brand-50',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      label: 'Active Licenses',
      value: activeSuppliers.toLocaleString(),
      sub: 'Verified active',
      color: 'text-green-700',
      bg: 'bg-green-50',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Expired / Terminated',
      value: expired.toLocaleString(),
      sub: latestRun ? `From last run ${formatRelative(latestRun.completedAt)}` : 'No runs yet',
      color: 'text-red-700',
      bg: 'bg-red-50',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Manual Review',
      value: unresolvedIssues.toLocaleString(),
      sub: 'Awaiting resolution',
      color: 'text-purple-700',
      bg: 'bg-purple-50',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      label: 'Errors',
      value: errors.toLocaleString(),
      sub: 'Scraper errors last run',
      color: 'text-orange-700',
      bg: 'bg-orange-50',
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="card p-5">
          <div className={`mb-3 inline-flex rounded-lg p-2 ${card.bg} ${card.color}`}>
            {card.icon}
          </div>
          <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          <p className="text-sm font-medium text-gray-700">{card.label}</p>
          <p className="mt-0.5 text-xs text-gray-400">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
