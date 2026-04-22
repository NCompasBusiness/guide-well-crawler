import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const runs = await db.verificationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(runs)
}

// Creates a PENDING run record; the crawler picks this up and begins processing
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const activeRun = await db.verificationRun.findFirst({ where: { status: 'RUNNING' } })
  if (activeRun) {
    return NextResponse.json({ error: 'A run is already in progress' }, { status: 409 })
  }

  const totalCount = await db.supplier.count({ where: { isActive: true } })

  const run = await db.verificationRun.create({
    data: {
      status: 'PENDING',
      totalCount,
      triggeredBy: session.user.email ?? 'manual',
    },
  })

  await db.auditLog.create({
    data: {
      action: 'TRIGGER_RUN',
      entityType: 'VerificationRun',
      entityId: run.id,
      userId: session.user.id,
    },
  })

  return NextResponse.json(run, { status: 201 })
}
