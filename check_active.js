const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const activeJobs = await prisma.serviceRequest.findMany({
    where: {
      status: { in: ['ACCEPTED', 'WORK_STARTED', 'TEMP_WORK_STARTED', 'TEMP_COMPLETED'] }
    },
    include: { sp: { include: { profile: true } } }
  });
  console.log('Active Jobs:', activeJobs.map(j => ({ id: j.id, sp: j.sp?.profile?.fullName, status: j.status })));
  process.exit(0);
}

main();
