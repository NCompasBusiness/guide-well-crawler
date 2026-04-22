import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

// Accepted column headers (case-insensitive aliases):
//   Supplier Name:  "Supplier Name" | "supplier_name" | "Legal Business Name"
//   License Number: "License Number" | "license_number" | "LicenseNumber"
//   License Type:   "License Type"   | "license_type"   | "LicenseType"
//   State (2-ltr):  "State"          | "state"          | "Issued State"
//   NPI (optional): "NPI"            | "npi"
//   Agency hint (optional): "Agency" | "agency_name" | "AgencyName" | "CrawlerKey"
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role === 'VIEWER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  // Build lowercase-key index so header matching is case-insensitive.
  const pick = (row: Record<string, unknown>, aliases: string[]): string => {
    const lower = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]),
    )
    for (const a of aliases) {
      const v = lower[a.toLowerCase()]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    return ''
  }

  const agencies = await db.licensingAgency.findMany({
    select: { id: true, name: true, state: true, crawlerKey: true },
  })
  const agencyByKey = new Map(agencies.map((a) => [a.crawlerKey.toLowerCase(), a]))
  const agencyByName = new Map(agencies.map((a) => [`${a.state.toLowerCase()}_${a.name.toLowerCase()}`, a]))
  const agencyByState = new Map<string, typeof agencies[number]>()
  for (const a of agencies) if (!agencyByState.has(a.state)) agencyByState.set(a.state, a)

  // Create (and cache) a placeholder agency for any state we haven't seeded.
  // Flagged isUrlBroken=true so rows route to the manual queue until the real
  // agency for that state is registered via the crawler repo.
  async function ensureAgencyForState(state: string) {
    const existing = agencyByState.get(state)
    if (existing) return existing
    const crawlerKey = `unassigned_${state.toLowerCase()}`
    const created = await db.licensingAgency.upsert({
      where: { crawlerKey },
      update: {},
      create: {
        name: `Unassigned (${state})`,
        state,
        websiteUrl: 'about:blank',
        crawlerKey,
        isUrlBroken: true,
        notes: 'Placeholder created during Excel import — no crawler registered for this state yet.',
      },
      select: { id: true, name: true, state: true, crawlerKey: true },
    })
    agencyByState.set(state, created)
    agencyByKey.set(created.crawlerKey.toLowerCase(), created)
    return created
  }

  let imported = 0
  let errors = 0
  const firstFailures: { rowIndex: number; reason: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const supplierName = pick(row, ['Supplier Name', 'supplier_name', 'Legal Business Name'])
    const licenseNumber = pick(row, ['License Number', 'license_number', 'LicenseNumber'])
    const licenseType = pick(row, ['License Type', 'license_type', 'LicenseType']) || 'Unknown'
    const stateRaw = pick(row, ['State', 'state', 'Issued State'])
    const state = stateRaw.toUpperCase().slice(0, 2)
    const npi = pick(row, ['NPI', 'npi']) || undefined
    const agencyHint = pick(row, ['Agency', 'agency_name', 'AgencyName', 'CrawlerKey'])

    if (!supplierName || !licenseNumber || !state) {
      errors++
      if (firstFailures.length < 3) {
        firstFailures.push({
          rowIndex: i + 2,
          reason: `missing ${[!supplierName && 'supplierName', !licenseNumber && 'licenseNumber', !state && 'state'].filter(Boolean).join(', ')}`,
        })
      }
      continue
    }

    let agency =
      agencyByKey.get(agencyHint.toLowerCase()) ??
      agencyByName.get(`${state.toLowerCase()}_${agencyHint.toLowerCase()}`) ??
      agencyByState.get(state)

    if (!agency) agency = await ensureAgencyForState(state)

    try {
      await db.supplier.upsert({
        where: { licenseNumber_agencyId: { licenseNumber, agencyId: agency.id } },
        update: { supplierName, licenseType, state, npi, isActive: true },
        create: { supplierName, licenseNumber, licenseType, state, npi, agencyId: agency.id },
      })
      imported++
    } catch (e) {
      errors++
      if (firstFailures.length < 3) {
        firstFailures.push({
          rowIndex: i + 2,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  await db.auditLog.create({
    data: {
      action: 'IMPORT_SUPPLIERS',
      entityType: 'Supplier',
      entityId: 'bulk',
      userId: session.user.id,
      details: JSON.stringify({ imported, errors, filename: file.name, firstFailures }),
    },
  })

  return NextResponse.json({ imported, errors, firstFailures })
}
