import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const sps = await prisma.user.findMany({
      where: { role: 'SP' },
      include: {
        profile: true,
        spProfile: true,
        spRequests: true
      }
    });

    console.log(`Found ${sps.length} SPs.`);
    console.log(sps[0]);
  } catch (error) {
    console.error('Error in script:', error);
  } finally {
    await prisma.$disconnect();
  }
}
run();
