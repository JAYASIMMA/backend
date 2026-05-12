const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- ALL CATEGORIES AND SUBCATEGORIES ---');
  const categories = await prisma.serviceCategory.findMany({
    include: { subCategories: true }
  });
  categories.forEach(cat => {
    console.log(`Category: ${cat.name} (${cat.id})`);
    cat.subCategories.forEach(sub => {
      console.log(`  - Subcategory: ${sub.name} (${sub.id})`);
    });
  });

  console.log('\n--- ALL SERVICE PROVIDERS ---');
  const sps = await prisma.serviceProviderProfile.findMany({
    include: {
      user: {
        include: { profile: true }
      }
    }
  });
  sps.forEach(sp => {
    console.log({
      name: sp.user?.profile?.fullName || 'No Name',
      categoryName: sp.categoryName,
      subCategoryName: sp.subCategoryName,
      dutyStatus: sp.dutyStatus,
      latitude: sp.latitude,
      longitude: sp.longitude,
      isVerified: sp.isVerified,
      locationUpdatedAt: sp.locationUpdatedAt
    });
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
