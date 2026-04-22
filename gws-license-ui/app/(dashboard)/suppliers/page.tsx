import { db } from '@/lib/db'
import { SupplierTable } from '@/components/suppliers/SupplierTable'
import { ImportSuppliersButton } from '@/components/suppliers/ImportSuppliersButton'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface SearchParams {
  page?: string
  search?: string
  state?: string
  status?: string
  agencyId?: string
}

export default async function SuppliersPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions)
  const canEdit = session?.user.role === 'ADMIN' || session?.user.role === 'OPERATOR'

  const page = Number(searchParams.page ?? 1)
  const perPage = 50
  const skip = (page - 1) * perPage

  const where = {
    isActive: true,
    ...(searchParams.search && {
      OR: [
        { supplierName: { contains: searchParams.search } },
        { licenseNumber: { contains: searchParams.search } },
      ],
    }),
    ...(searchParams.state && { state: searchParams.state }),
    ...(searchParams.status && { lastStatus: searchParams.status as any }),
    ...(searchParams.agencyId && { agencyId: searchParams.agencyId }),
  }

  const [suppliers, total, agencies] = await Promise.all([
    db.supplier.findMany({
      where,
      skip,
      take: perPage,
      orderBy: { supplierName: 'asc' },
      include: { agency: { select: { name: true, state: true } } },
    }),
    db.supplier.count({ where }),
    db.licensingAgency.findMany({
      select: { id: true, name: true, state: true },
      orderBy: [{ state: 'asc' }, { name: 'asc' }],
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">
            {total.toLocaleString()} active DME suppliers
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-3">
            <ImportSuppliersButton />
            <a href="/api/suppliers/export" className="btn-secondary btn-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </a>
          </div>
        )}
      </div>

      <SupplierTable
        suppliers={suppliers as any}
        total={total}
        page={page}
        perPage={perPage}
        agencies={agencies}
        searchParams={searchParams}
        canEdit={canEdit}
      />
    </div>
  )
}
