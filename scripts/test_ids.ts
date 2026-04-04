import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const sps = await prisma.user.findMany({ where: { role: 'SP' }, include: { profile: true } });
  const cats = await prisma.serviceCategory.findMany({ include: { subcategories: true } });
  const custs = await prisma.user.findMany({ where: { role: 'CUSTOMER' }, include: { addresses: true } });

  console.log('SPs:', sps.map(s => ({ id: s.id, name: s.profile?.fullName })));
  console.log('Categories:', cats.map(c => ({ id: c.id, name: c.name, subcats: c.subcategories.map(s => ({ id: s.id, name: s.name })) })));
  console.log('Customers:', custs.map(c => ({ id: c.id, name: c.profile?.fullName, addrId: c.addresses[0]?.id })));
}

check().then(() => prisma.$disconnect());
