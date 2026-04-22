const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Wipe the previous GA test data for a clean run.
  const v = await db.licenseVerification.deleteMany({})
  const s = await db.supplier.deleteMany({})
  const r = await db.verificationRun.deleteMany({})

  // Un-break the real Texas agencies. tx_hhs remains CAPTCHA-blocked by design.
  const cleared = await db.licensingAgency.updateMany({
    where: { crawlerKey: 'tx_dshs' },
    data: { isUrlBroken: false },
  })

  console.log(JSON.stringify({
    verifications_deleted: v.count,
    suppliers_deleted: s.count,
    runs_deleted: r.count,
    tx_dshs_unbroken: cleared.count,
  }, null, 2))
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
