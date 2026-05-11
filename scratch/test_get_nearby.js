const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const category = await prisma.serviceCategory.findFirst({
    where: { name: { equals: 'Electrician', mode: 'insensitive' } }
  });

  if (!category) {
    console.log('Category Electrician not found');
    process.exit(1);
  }

  console.log('Electrician Category ID:', category.id);

  // Use the exact coordinates from the customer's request (e.g. 12.9627466, 80.2518215)
  const latitude = 12.9627466;
  const longitude = 80.2518215;
  const radiusMeters = 5000.0;

  console.log(`Searching near lat: ${latitude}, lng: ${longitude}, radius: ${radiusMeters}m`);

  // Print all electricians in DB first
  const allElectricians = await prisma.serviceProviderProfile.findMany({
    where: { categoryName: 'Electrician' },
    include: { user: { include: { profile: true } } }
  });
  console.log('\n--- All Electricians ---');
  allElectricians.forEach(e => {
    console.log({
      name: e.user.profile.fullName,
      dutyStatus: e.dutyStatus,
      lat: e.latitude,
      lng: e.longitude,
      locationUpdatedAt: e.locationUpdatedAt
    });
  });

  // Run the raw query
  console.log('\n--- Running Raw Query ---');
  try {
    const sps = await prisma.$queryRaw`
      SELECT 
        u.id,
        p."fullName",
        sp.latitude,
        sp.longitude,
        sp."locationUpdatedAt",
        ST_Distance(
          ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
          ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography
        ) as distance
      FROM "User" u
      JOIN "Profile" p ON u.id = p."userId"
      JOIN "ServiceProviderProfile" sp ON u.id = sp."userId"
      WHERE LOWER(sp."categoryName") = LOWER(${category.name})
      AND sp."dutyStatus" = true
      AND sp."locationUpdatedAt" >= NOW() - INTERVAL '60 seconds'
      AND ST_DWithin(
        ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
        ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
    `;
    console.log('Query results:', sps);
  } catch (err) {
    console.error('Error running raw query:', err);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
