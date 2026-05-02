"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkUser() {
    const mobile = '+918248387253';
    const user = await prisma.user.findUnique({
        where: { mobile },
        include: { spProfile: true, profile: true }
    });
    console.log('User found:', JSON.stringify(user, null, 2));
}
checkUser()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
