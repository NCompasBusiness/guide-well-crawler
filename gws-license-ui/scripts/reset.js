const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const v = await db.licenseVerification.deleteMany({})
  const s = await db.supplier.deleteMany({})
  const r = await db.verificationRun.deleteMany({})
  const a = await db.auditLog.deleteMany({ where: { entityType: { in: ['Supplier', 'LicenseVerification'] } } })
  console.log(JSON.stringify({
    verifications_deleted: v.count,
    suppliers_deleted: s.count,
    runs_deleted: r.count,
    audit_logs_deleted: a.count,
  }, null, 2))
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
