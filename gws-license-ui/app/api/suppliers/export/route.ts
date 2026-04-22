import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const suppliers = await db.supplier.findMany({
    where: { isActive: true },
    orderBy: [{ state: 'asc' }, { supplierName: 'asc' }],
    include: { agency: { select: { name: true } } },
  })

  const rows = suppliers.map((s) => ({
    'Supplier Name': s.supplierName,
    'NPI': s.npi ?? '',
    'State': s.state,
    'License Number': s.licenseNumber,
    'License Type': s.licenseType,
    'Agency': s.agency.name,
    'Last Status': s.lastStatus ?? '',
    'Last Verified': s.lastVerifiedAt ? s.lastVerifiedAt.toISOString().split('T')[0] : '',
  }))

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Suppliers')

  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="suppliers_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  })
}
