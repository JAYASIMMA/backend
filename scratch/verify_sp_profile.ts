import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = '3475577e-1284-44a8-b53f-3bc5815c5380';
  const profile = await prisma.serviceProviderProfile.findUnique({
    where: { userId }
  });
  console.log('SP Profile:', JSON.stringify(profile, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
