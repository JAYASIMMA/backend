const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Subcategory Filtering Verification ---');

  // 1. Fetch category and subcategories
  const category = await prisma.serviceCategory.findUnique({
    where: { name: 'Electrician' },
    include: { subCategories: true }
  });

  if (!category) {
    console.error('Electrician category not found');
    process.exit(1);
  }

  console.log(`\nMain Category: ${category.name} (${category.id})`);
  category.subCategories.forEach(sc => {
    console.log(` - Subcategory: ${sc.name} (${sc.id})`);
  });

  // 2. Query all ServiceProviderProfiles with user details
  const spProfiles = await prisma.serviceProviderProfile.findMany({
    include: { user: { include: { profile: true } } }
  });

  console.log('\n--- Service Provider Profiles in DB ---');
  spProfiles.forEach(sp => {
    console.log({
      name: sp.user.profile?.fullName,
      categoryName: sp.categoryName,
      subCategoryName: sp.subCategoryName,
      dutyStatus: sp.dutyStatus,
      locationUpdatedAt: sp.locationUpdatedAt,
      latitude: sp.latitude,
      longitude: sp.longitude
    });
  });

  // Let's simulate a search near John's position
  const latitude = 12.9627466;
  const longitude = 80.2518215;
  const radiusMeters = 5000;

  console.log(`\n--- Simulating getNearbySPs ---`);

  // Case 1: Search main category only (no subCategoryId specified)
  console.log('\n[Case 1] Fetching all nearby Electricians (Main Category Only)...');
  const allNearby = await prisma.$queryRaw`
    SELECT 
      u.id,
      p."fullName",
      sp."categoryName",
      sp."subCategoryName",
      sp."dutyStatus",
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
  console.log('Results:', allNearby);

  // Case 2: Search specific subcategory "AC/Wiring"
  const acWiringSub = category.subCategories.find(sc => sc.name === 'AC/Wiring');
  if (acWiringSub) {
    console.log(`\n[Case 2] Fetching nearby Electricians for subcategory "${acWiringSub.name}" (${acWiringSub.id})...`);
    const filteredBySub = await prisma.$queryRaw`
      SELECT 
        u.id,
        p."fullName",
        sp."categoryName",
        sp."subCategoryName",
        sp."dutyStatus",
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
      AND LOWER(sp."subCategoryName") = LOWER(${acWiringSub.name})
      AND ST_DWithin(
        ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
        ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
    `;
    console.log('Results (should include John, who is registered under AC/Wiring):', filteredBySub);
  }

  // Case 3: Search specific subcategory "Switch replace"
  const switchReplaceSub = category.subCategories.find(sc => sc.name === 'Switch replace');
  if (switchReplaceSub) {
    console.log(`\n[Case 3] Fetching nearby Electricians for subcategory "${switchReplaceSub.name}" (${switchReplaceSub.id})...`);
    const filteredBySub = await prisma.$queryRaw`
      SELECT 
        u.id,
        p."fullName",
        sp."categoryName",
        sp."subCategoryName",
        sp."dutyStatus",
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
      AND LOWER(sp."subCategoryName") = LOWER(${switchReplaceSub.name})
      AND ST_DWithin(
        ST_SetSRID(ST_Point(sp.longitude, sp.latitude), 4326)::geography,
        ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
    `;
    console.log('Results (should be empty because Muniyappan\'s location is older than 60 seconds):', filteredBySub);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
