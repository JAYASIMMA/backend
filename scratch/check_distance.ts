import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const addressId = '03927e01-690c-46d5-93ee-d8503d2ad726';
  const coords: any[] = await prisma.$queryRaw`
    SELECT ST_X(coordinates::geometry) as lng, ST_Y(coordinates::geometry) as lat 
    FROM "Address" 
    WHERE id = ${addressId}
  `;
  console.log('Request Coordinates:', coords);

  const spUserId = 'b5173d29-0e7c-4a80-80c9-fb581e70fe92';
  const spProfile = await prisma.serviceProviderProfile.findUnique({
    where: { userId: spUserId }
  });
  console.log('SP Profile Coordinates:', { lat: spProfile?.latitude, lng: spProfile?.longitude });
}

main().catch(console.error).finally(() => prisma.$disconnect());
