"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const address = await prisma.$queryRaw `SELECT id, label, "addressLine", ST_AsText(coordinates) as coords FROM "Address" WHERE id = '03927e01-690c-46d5-93ee-d8503d2ad726'`;
    console.log(JSON.stringify(address, null, 2));
}
main()
    .catch(e => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
