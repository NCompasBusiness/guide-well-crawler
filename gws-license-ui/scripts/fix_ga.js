const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // 1. Clear the broken-URL flag on the real GA agencies so the crawler actually runs.
  const cleared = await db.licensingAgency.updateMany({
    where: { crawlerKey: { in: ['ga_professional_licensing', 'ga_composite_medical'] } },
    data: { isUrlBroken: false },
  })

  // 2. Reassign all GA suppliers currently pointing at ga_composite_medical
  //    over to ga_professional_licensing (correct board for PT / SOS-licensed professions).
  const gaSos = await db.licensingAgency.findUnique({ where: { crawlerKey: 'ga_professional_licensing' } })
  const gaCmb = await db.licensingAgency.findUnique({ where: { crawlerKey: 'ga_composite_medical' } })
  const reassigned = await db.supplier.updateMany({
    where: { agencyId: gaCmb.id },
    data: { agencyId: gaSos.id, lastStatus: null, lastVerifiedAt: null },
  })

  // 3. Wipe verifications from the previous run for these suppliers so the new run is clean.
  const wiped = await db.licenseVerification.deleteMany({
    where: { supplier: { state: 'GA' } },
  })

  console.log(JSON.stringify({
    cleared_broken_flag: cleared.count,
    reassigned_suppliers: reassigned.count,
    wiped_verifications: wiped.count,
  }, null, 2))
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
