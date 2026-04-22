import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const ResolveSchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED', 'NOT_FOUND']),
  effectiveDate: z.string().optional(),
  terminationDate: z.string().optional(),
  correctedUrl: z.string().url().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ResolveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { status, effectiveDate, terminationDate, correctedUrl } = parsed.data

  const verification = await db.licenseVerification.update({
    where: { id: params.id },
    data: {
      status,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      terminationDate: terminationDate ? new Date(terminationDate) : undefined,
      manualResolvedAt: new Date(),
      manualResolvedBy: session.user.email ?? session.user.id,
    },
    include: { supplier: true },
  })

  // Update supplier's cached last status
  await db.supplier.update({
    where: { id: verification.supplierId },
    data: { lastStatus: status, lastVerifiedAt: new Date() },
  })

  // If URL was corrected, update the agency
  if (correctedUrl) {
    await db.licensingAgency.update({
      where: { id: verification.supplier.agencyId },
      data: { websiteUrl: correctedUrl, isUrlBroken: false },
    })
  }

  // Re-count manual items in the run and update run counts
  const run = await db.verificationRun.findUnique({
    where: { id: verification.runId },
  })
  if (run) {
    const unresolvedInRun = await db.licenseVerification.count({
      where: { runId: run.id, requiresManual: true, manualResolvedAt: null },
    })
    if (unresolvedInRun === 0 && run.status === 'PARTIAL') {
      await db.verificationRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED' },
      })
    }
  }

  await db.auditLog.create({
    data: {
      action: 'RESOLVE_ISSUE',
      entityType: 'LicenseVerification',
      entityId: params.id,
      userId: session.user.id,
      details: JSON.stringify({ status, correctedUrl }),
    },
  })

  return NextResponse.json(verification)
}
