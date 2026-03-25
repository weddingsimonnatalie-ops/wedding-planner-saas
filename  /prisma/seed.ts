import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("==> Seeding database...");

  let createdCount = 0;
  let skippedCount = 0;

  for (let i = 1; i <= 10; i++) {
    const name = process.env[`SEED_ADMIN_${i}_NAME`];
    const email = process.env[`SEED_ADMIN_${i}_EMAIL`];
    const password = process.env[`SEED_ADMIN_${i}_PASSWORD`];

    if (!name || !email || !password) {
      if (i === 1) {
        // Block 1 missing — that's a problem but handled below
        console.log(`Skipped SEED_ADMIN_${i} (incomplete or missing)`);
      } else if (name || email || password) {
        // Partial block — warn
        console.log(`Skipped SEED_ADMIN_${i} (incomplete or missing)`);
      } else {
        // Block completely absent — stop iterating
        break;
      }
      skippedCount++;
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`User ${email} already exists — skipping`);
      skippedCount++;
      continue;
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        email,
        accounts: {
          create: {
            providerId: "credential",
            accountId: email,
            password: hashed,
          },
        },
      },
    });
    console.log(`Created user ${email}`);
    createdCount++;
  }

  // Ensure at least one user exists
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    throw new Error(
      "Seed completed but no users exist in the database. " +
        "Set SEED_ADMIN_1_NAME, SEED_ADMIN_1_EMAIL, and SEED_ADMIN_1_PASSWORD in your .env file."
    );
  }

  // Seed SupplierCategory if empty
  const supplierCatCount = await prisma.supplierCategory.count();
  if (supplierCatCount === 0) {
    const supplierCats = [
      'Venue','Catering','Photography','Videography','Florist',
      'Music / DJ','Cake','Dress / Attire','Transport',
      'Stationery','Hair & Makeup','Jewellery','Accommodation','Other'
    ];
    for (let i = 0; i < supplierCats.length; i++) {
      await prisma.supplierCategory.create({
        data: { name: supplierCats[i], sortOrder: i * 10, colour: '#6366f1' }
      });
    }
    console.log('Seeded supplier categories');
  }

  // Seed AppointmentCategory if empty
  const apptCatCount = await prisma.appointmentCategory.count();
  if (apptCatCount === 0) {
    const apptCats = [
      { name: 'Fitting', colour: '#ec4899' },
      { name: 'Tasting', colour: '#f59e0b' },
      { name: 'Rehearsal', colour: '#3b82f6' },
      { name: 'Consultation', colour: '#a855f7' },
      { name: 'Viewing', colour: '#14b8a6' },
      { name: 'Ceremony Practice', colour: '#6366f1' },
      { name: 'Other', colour: '#6b7280' },
    ];
    for (let i = 0; i < apptCats.length; i++) {
      await prisma.appointmentCategory.create({
        data: { ...apptCats[i], sortOrder: i * 10 }
      });
    }
    console.log('Seeded appointment categories');
  }

  // Seed TaskCategory if empty
  const taskCatCount = await prisma.taskCategory.count();
  if (taskCatCount === 0) {
    const taskCats = [
      { name: 'Admin',        colour: '#64748b' },
      { name: 'Venue',        colour: '#14b8a6' },
      { name: 'Catering',     colour: '#f59e0b' },
      { name: 'Attire',       colour: '#ec4899' },
      { name: 'Flowers',      colour: '#22c55e' },
      { name: 'Photography',  colour: '#3b82f6' },
      { name: 'Music',        colour: '#a855f7' },
      { name: 'Stationery',   colour: '#f97316' },
      { name: 'Transport',    colour: '#06b6d4' },
      { name: 'Honeymoon',    colour: '#6366f1' },
      { name: 'Other',        colour: '#6b7280' },
    ];
    for (let i = 0; i < taskCats.length; i++) {
      await prisma.taskCategory.create({
        data: { ...taskCats[i], sortOrder: i * 10 }
      });
    }
    console.log('Seeded task categories');
  }

  console.log(
    `==> Seed complete. Created: ${createdCount}, Skipped: ${skippedCount}. Total users: ${userCount}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
