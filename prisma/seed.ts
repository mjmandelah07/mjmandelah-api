import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@mjmandelah.store').toLowerCase();
  const alreadySeeded = await prisma.user.findUnique({ where: { email } });
  if (alreadySeeded) {
    console.log(`Already seeded (${email}). Skipping.`);
    return;
  }

  const password = process.env.SEED_SUPER_ADMIN_PASSWORD || 'ChangeMe123!';
  const fullName = process.env.SEED_SUPER_ADMIN_NAME || 'Super Admin';
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName, role: Role.SUPER_ADMIN },
  });

  await prisma.storeProfile.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: 'Mjmandelah Store',
      currency: 'NGN',
      receiptFooter: 'Goods sold in good condition. Thank you.',
    },
  });

  const roots = [
    { name: 'Drinks', slug: 'drinks', description: 'Water, soda, juice, and other drinks' },
    { name: 'Provisions', slug: 'provisions', description: 'Packaged food and household provisions' },
    { name: 'Groceries', slug: 'groceries', description: 'Fresh and everyday groceries' },
  ];
  for (const category of roots) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  console.log(`Super admin ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
