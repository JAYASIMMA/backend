const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const spProfile = await prisma.serviceProviderProfile.findFirst({
    where: {
      user: {
        profile: {
          fullName: 'John'
        }
      }
    }
  });

  if (!spProfile) {
    console.log('John not found in database.');
    process.exit(1);
  }

  const updated = await prisma.serviceProviderProfile.update({
    where: { userId: spProfile.userId },
    data: {
      dutyStatus: true,
      latitude: 12.9627545,
      longitude: 80.2515114,
      locationUpdatedAt: new Date()
    }
  });

  console.log('Successfully updated John location to NOW:', updated.locationUpdatedAt);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
