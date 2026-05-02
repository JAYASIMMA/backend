"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const sps = await prisma.user.findMany({
        where: {
            role: 'SP'
        },
        include: {
            spProfile: true
        }
    });
    console.log(JSON.stringify(sps, null, 2));
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
