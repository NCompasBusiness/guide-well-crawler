import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

// Called by the Python crawler to post progress updates and results
const ProgressSchema = z.object({
  runId: z.string(),
  event: z.enum(['START', 'PROGRESS', 'RESULT', 'COMPLETE', 'FAIL']),
  // For RESULT events
  result: z
    .object({
      supplierId: z.string(),
      status: z.enum(['ACTIVE','EXPIRED','TERMINATED','NOT_FOUND','ERROR','MANUAL_REQUIRED','PENDING']),
      effectiveDate: z.string().nullable().optional(),
      terminationDate: z.string().nullable().optional(),
      rawData: z.record(z.any()).optional(),
      errorMessage: z.string().nullable().optional(),
      requiresManual: z.boolean().default(false),
      manualReason: z
        .enum(['CAPTCHA_REQUIRED','BROKEN_URL','PASSWORD_PROTECTED','COMPLEX_NAVIGATION','SITE_UNAVAILABLE','OTHER'])
        .nullable()
        .optional(),
    })
    .optional(),
  // For COMPLETE/FAIL
  summary: z
    .object({
      totalCount: z.number(),
      successCount: z.number(),
      failedCount: z.number(),
      manualCount: z.number(),
      errorCount: z.number(),
    })
    .optional(),
  errorMessage: z.string().optional(),
})

function verifySecret(req: NextRequest): boolean {
  const provided = req.headers.get('x-crawler-secret')
  return provided === process.env.CRAWLER_WEBHOOK_SECRET
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = ProgressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { runId, event, result, summary, errorMessage } = parsed.data

  const run = await db.verificationRun.findUnique({ where: { id: runId } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (event === 'START') {
    await db.verificationRun.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
  }

  if (event === 'RESULT' && result) {
    const verification = await db.licenseVerification.create({
      data: {
        runId,
        supplierId: result.supplierId,
        status: result.status,
        effectiveDate: result.effectiveDate ? new Date(result.effectiveDate) : null,
        terminationDate: result.terminationDate ? new Date(result.terminationDate) : null,
        rawData: result.rawData ? JSON.stringify(result.rawData) : null,
        errorMessage: result.errorMessage,
        requiresManual: result.requiresManual,
        manualReason: result.manualReason ?? null,
      },
    })

    // Update supplier's cached status
    await db.supplier.update({
      where: { id: result.supplierId },
      data: {
        lastStatus: result.status,
        lastVerifiedAt: new Date(),
      },
    })

    return NextResponse.json({ id: verification.id })
  }

  if (event === 'COMPLETE' && summary) {
    const hasManual = summary.manualCount > 0
    await db.verificationRun.update({
      where: { id: runId },
      data: {
        status: hasManual ? 'PARTIAL' : 'COMPLETED',
        completedAt: new Date(),
        ...summary,
      },
    })
  }

  if (event === 'FAIL') {
    await db.verificationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        notes: errorMessage,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
