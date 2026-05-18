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

  const headers = [
    'Supplier Name',
    'NPI',
    'State',
    'License Number',
    'License Type',
    'Agency',
    'Verification Status',
    'Effective Date',
    'Termination Date',
    'Verification Method',
    'Manual Reason',
    'Error Message',
    'Verified At',
  ]

  const dataRows = run.verifications.map((v) => [
    v.supplier.supplierName,
    v.supplier.npi ?? '',
    v.supplier.state,
    v.supplier.licenseNumber,
    v.supplier.licenseType ?? '',
    v.supplier.agency.name,
    v.status,
    v.effectiveDate ? v.effectiveDate.toISOString().split('T')[0] : '',
    v.terminationDate ? v.terminationDate.toISOString().split('T')[0] : '',
    v.manualResolvedAt ? 'CAPTCHA-Assisted' : 'Automated',
    v.manualReason ?? '',
    v.errorMessage ?? '',
    v.verifiedAt.toISOString().replace('T', ' ').split('.')[0],
  ])

  const aoa = [headers, ...dataRows]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // Calculate column widths from actual content
  const colWidths = headers.map((header, colIdx) => {
    const maxDataLen = dataRows.reduce((max, row) => {
      const cell = String(row[colIdx] ?? '')
      return Math.max(max, cell.length)
    }, 0)
    return { wch: Math.min(Math.max(header.length, maxDataLen, 10), 60) }
  })
  sheet['!cols'] = colWidths

  // Auto-filter on header row
  sheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` }

  const workbook = XLSX.utils.book_new()
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
