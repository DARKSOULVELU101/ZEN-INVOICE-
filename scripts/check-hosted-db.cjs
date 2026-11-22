require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    console.log("invoices", await prisma.invoice.count());
    console.log("customers", await prisma.customer.count());
  } catch (error) {
    console.error("FAILED", error.message ?? error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
