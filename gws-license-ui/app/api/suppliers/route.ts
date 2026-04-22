import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const SupplierSchema = z.object({
  supplierName: z.string().min(1),
  npi: z.string().optional(),
  state: z.string().length(2),
  licenseNumber: z.string().min(1),
  licenseType: z.string().min(1),
  agencyId: z.string().cuid(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const page = Number(searchParams.get('page') ?? 1)
  const perPage = Number(searchParams.get('perPage') ?? 50)
  const search = searchParams.get('search')
  const state = searchParams.get('state')
  const status = searchParams.get('status')

  const where = {
    isActive: true,
    ...(search && {
      OR: [
        { supplierName: { contains: search } },
        { licenseNumber: { contains: search } },
      ],
    }),
    ...(state && { state }),
    ...(status && { lastStatus: status as any }),
  }

  const [suppliers, total] = await Promise.all([
    db.supplier.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { supplierName: 'asc' },
      include: { agency: { select: { name: true, state: true } } },
    }),
    db.supplier.count({ where }),
  ])

  return NextResponse.json({ suppliers, total, page, perPage })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = SupplierSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const supplier = await db.supplier.create({ data: parsed.data })
  await db.auditLog.create({
    data: {
      action: 'CREATE_SUPPLIER',
      entityType: 'Supplier',
      entityId: supplier.id,
      userId: session.user.id,
    },
  })

  return NextResponse.json(supplier, { status: 201 })
}
