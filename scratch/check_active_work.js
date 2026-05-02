"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const userId = '3475577e-1284-44a8-b53f-3bc5815c5380'; // Carpenter
    const activeWork = await prisma.serviceRequest.findFirst({
        where: {
            spId: userId,
            status: { in: ['WORK_STARTED', 'TEMP_WORK_STARTED', 'TEMP_COMPLETED'] }
        }
    });
    console.log('Active Work:', activeWork);
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
