import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const spUsers = await prisma.user.findMany({
    where: { role: 'SP' },
    include: { profile: true, spProfile: true }
  });

  console.log('=== SP USERS ===');
  spUsers.forEach(u => {
    console.log(`User ID: ${u.id} | Name: ${u.profile?.fullName} | spProfile ID: ${u.spProfile?.id}`);
  });

  const requests = await prisma.serviceRequest.findMany({
    where: { spId: { not: null } },
    select: { id: true, spId: true, status: true }
  });

  console.log('\n=== REQUESTS WITH SP_ID ===');
  requests.forEach(r => {
    console.log(`Req ID: ${r.id} | spId: ${r.spId} | Status: ${r.status}`);
  });

  // Check matching
  console.log('\n=== MATCHING CHECK ===');
  spUsers.forEach(u => {
    const matchedByUser = requests.filter(r => r.spId === u.id);
    const matchedByProfile = requests.filter(r => r.spId === u.spProfile?.id);
    console.log(`SP: ${u.profile?.fullName || u.mobile}`);
    console.log(`  Matched by User.id (${u.id}): total=${matchedByUser.length}, completed=${matchedByUser.filter(r => r.status==='COMPLETED').length}`);
    console.log(`  Matched by spProfile.id (${u.spProfile?.id}): total=${matchedByProfile.length}, completed=${matchedByProfile.filter(r => r.status==='COMPLETED').length}`);
  });
}

main().finally(() => prisma.$disconnect());
