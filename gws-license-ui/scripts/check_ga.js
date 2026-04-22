const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const agencies = await db.licensingAgency.findMany({
    where: { state: 'GA' },
    select: { id: true, name: true, crawlerKey: true, websiteUrl: true, isUrlBroken: true, isCaptchaBlocked: true },
  })
  console.log('GA agencies in DB:')
  console.log(JSON.stringify(agencies, null, 2))

  const suppliers = await db.supplier.findMany({
    where: { state: 'GA' },
    include: { agency: { select: { crawlerKey: true, isUrlBroken: true } } },
  })
  console.log('\nGA suppliers in DB:')
  console.log(JSON.stringify(suppliers, null, 2))

  const lastRun = await db.verificationRun.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      verifications: {
        include: { supplier: { select: { supplierName: true, licenseNumber: true, state: true } } },
      },
    },
  })
  console.log('\nLast run detail:')
  console.log(JSON.stringify(lastRun, null, 2))

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
