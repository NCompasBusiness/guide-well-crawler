import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { Sidebar } from '@/components/nav/Sidebar'
import { TopBar } from '@/components/nav/TopBar'
import { db } from '@/lib/db'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const unresolvedIssues = await db.licenseVerification.count({
    where: { requiresManual: true, manualResolvedAt: null },
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar unresolvedIssues={unresolvedIssues} userRole={session.user.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={session.user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
