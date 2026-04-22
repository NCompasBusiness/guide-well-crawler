import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { z } from 'zod'

const PatchSchema = z.object({
  websiteUrl: z.string().url().optional(),
  isUrlBroken: z.boolean().optional(),
  isCaptchaBlocked: z.boolean().optional(),
  isPasswordProtected: z.boolean().optional(),
  notes: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const agency = await db.licensingAgency.update({
    where: { id: params.id },
    data: parsed.data,
  })

  await db.auditLog.create({
    data: {
      action: 'UPDATE_AGENCY',
      entityType: 'LicensingAgency',
      entityId: agency.id,
      userId: session.user.id,
      details: parsed.data,
    },
  })

  return NextResponse.json(agency)
}
