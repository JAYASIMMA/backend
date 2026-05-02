"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function checkSub() {
    const subs = await prisma.serviceSubcategory.findMany();
    console.log('Subcategories:', JSON.stringify(subs, null, 2));
}
checkSub()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
