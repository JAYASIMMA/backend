const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sps = await prisma.serviceProviderProfile.findMany({
    include: { user: { include: { profile: true } } }
  });
  sps.forEach(sp => {
    console.log(`Worker: ${sp.user.profile.fullName}, Category: ${sp.categoryName}, Duty: ${sp.dutyStatus}`);
  });
  process.exit(0);
}

main();
