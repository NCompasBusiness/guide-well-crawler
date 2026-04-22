import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { EditAgencyButton } from '@/components/agencies/EditAgencyButton'

export const dynamic = 'force-dynamic'

export default async function AgenciesPage() {
  const session = await getServerSession(authOptions)
  const canEdit = session?.user.role === 'ADMIN'

  const agencies = await db.licensingAgency.findMany({
    orderBy: [{ state: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { suppliers: true } } },
  })

  const broken = agencies.filter((a) => a.isUrlBroken).length
  const captcha = agencies.filter((a) => a.isCaptchaBlocked).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Licensing Agencies</h1>
          <p className="text-sm text-gray-500">
            {agencies.length} agencies across 29 states &middot;{' '}
            <span className="text-yellow-600">{captcha} CAPTCHA-blocked</span> &middot;{' '}
            <span className="text-red-600">{broken} broken URLs</span>
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="table-header">State</th>
              <th className="table-header">Agency Name</th>
              <th className="table-header">Crawler Key</th>
              <th className="table-header">Suppliers</th>
              <th className="table-header">Health</th>
              <th className="table-header">Last Success</th>
              <th className="table-header">Website</th>
              {canEdit && <th className="table-header">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {agencies.map((agency) => (
              <tr
                key={agency.id}
                className={
                  agency.isUrlBroken
                    ? 'bg-red-50'
                    : agency.isCaptchaBlocked
                    ? 'bg-yellow-50'
                    : 'hover:bg-gray-50'
                }
              >
                <td className="table-cell">
                  <span className="badge bg-gray-100 text-gray-700">{agency.state}</span>
                </td>
                <td className="table-cell font-medium text-gray-900 max-w-[220px]">
                  <p className="truncate">{agency.name}</p>
                </td>
                <td className="table-cell font-mono text-xs text-gray-500">
                  {agency.crawlerKey}
                </td>
                <td className="table-cell text-center font-medium">
                  {agency._count.suppliers.toLocaleString()}
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    {agency.isUrlBroken && (
                      <span className="badge bg-red-100 text-red-700">Broken URL</span>
                    )}
                    {agency.isCaptchaBlocked && (
                      <span className="badge bg-yellow-100 text-yellow-800">CAPTCHA</span>
                    )}
                    {agency.isPasswordProtected && (
                      <span className="badge bg-orange-100 text-orange-800">Password</span>
                    )}
                    {!agency.isUrlBroken && !agency.isCaptchaBlocked && !agency.isPasswordProtected && (
                      <span className="badge bg-green-100 text-green-700">OK</span>
                    )}
                  </div>
                </td>
                <td className="table-cell text-xs text-gray-500">
                  {formatDate(agency.lastSuccessAt)}
                </td>
                <td className="table-cell">
                  <a
                    href={agency.websiteUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Open ↗
                  </a>
                </td>
                {canEdit && (
                  <td className="table-cell">
                    <EditAgencyButton agency={agency} />
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
