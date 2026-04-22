import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const run = await db.verificationRun.findUnique({
    where: { id: params.id },
    include: {
      verifications: {
        include: {
          supplier: { include: { agency: { select: { name: true } } } },
        },
        orderBy: [{ supplier: { state: 'asc' } }, { supplier: { supplierName: 'asc' } }],
      },
    },
  })

  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows = run.verifications.map((v) => ({
    'Supplier Name': v.supplier.supplierName,
    'NPI': v.supplier.npi ?? '',
    'State': v.supplier.state,
    'License Number': v.supplier.licenseNumber,
    'License Type': v.supplier.licenseType,
    'Agency': v.supplier.agency.name,
    'Verification Status': v.status,
    'Effective Date': v.effectiveDate ? v.effectiveDate.toISOString().split('T')[0] : '',
    'Termination Date': v.terminationDate ? v.terminationDate.toISOString().split('T')[0] : '',
    'Requires Manual Review': v.requiresManual ? 'YES' : 'NO',
    'Manual Reason': v.manualReason ?? '',
    'Error Message': v.errorMessage ?? '',
    'Manually Resolved': v.manualResolvedAt ? 'YES' : 'NO',
    'Verified At': v.verifiedAt.toISOString(),
  }))

  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)

  // Auto-size columns
  const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
    wch: Math.max(key.length, 15),
  }))
  sheet['!cols'] = colWidths

  XLSX.utils.book_append_sheet(workbook, sheet, 'Verification Results')

  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const dateStr = run.createdAt.toISOString().split('T')[0]

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="gws_verification_${dateStr}.xlsx"`,
    },
  })
}
