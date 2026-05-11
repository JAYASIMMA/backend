const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sps = await prisma.serviceProviderProfile.findMany({
    include: { user: { include: { profile: true } } }
  });
  console.log('--- Service Providers Details ---');
  sps.forEach(sp => {
    console.log({
      name: sp.user?.profile?.fullName || 'N/A',
      category: sp.categoryName,
      dutyStatus: sp.dutyStatus,
      latitude: sp.latitude,
      longitude: sp.longitude,
      locationUpdatedAt: sp.locationUpdatedAt,
      now: new Date(),
      ageSeconds: sp.locationUpdatedAt ? (new Date() - new Date(sp.locationUpdatedAt)) / 1000 : 'N/A'
    });
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
