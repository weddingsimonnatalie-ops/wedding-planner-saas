import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("==> Seeding database (dev mode)...");

  // -------------------------------------------------------------------------
  // 1. Create dev Wedding with active subscription
  // -------------------------------------------------------------------------
  let wedding = await prisma.wedding.findFirst();
  if (!wedding) {
    wedding = await prisma.wedding.create({
      data: {
        coupleName: "Simon & Natalie",
        weddingDate: new Date("2026-09-06"),
subscriptionStatus: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      },
    });
    console.log(`Created dev Wedding: ${wedding.id}`);
  } else {
    console.log(`Wedding already exists: ${wedding.id} — skipping`);
  }

  // -------------------------------------------------------------------------
  // 2. Create dev admin user and link to Wedding
  // -------------------------------------------------------------------------
  const name = process.env.SEED_ADMIN_1_NAME ?? "Admin";
  const email = process.env.SEED_ADMIN_1_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_1_PASSWORD ?? "password";

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const hashed = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
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
  } else {
    console.log(`User ${email} already exists — skipping`);
  }

  // Link user to wedding as ADMIN if not already
  const existingMember = await prisma.weddingMember.findUnique({
    where: { userId_weddingId: { userId: user.id, weddingId: wedding.id } },
  });
  if (!existingMember) {
    await prisma.weddingMember.create({
      data: { userId: user.id, weddingId: wedding.id, role: "ADMIN" },
    });
    console.log(`Linked ${email} to wedding as ADMIN`);
  }

  // Optional second user
  const email2 = process.env.SEED_ADMIN_2_EMAIL;
  const name2 = process.env.SEED_ADMIN_2_NAME;
  const password2 = process.env.SEED_ADMIN_2_PASSWORD;
  if (email2 && name2 && password2) {
    let user2 = await prisma.user.findUnique({ where: { email: email2 } });
    if (!user2) {
      const hashed2 = await bcrypt.hash(password2, 10);
      user2 = await prisma.user.create({
        data: {
          name: name2,
          email: email2,
          accounts: {
            create: {
              providerId: "credential",
              accountId: email2,
              password: hashed2,
            },
          },
        },
      });
      console.log(`Created user ${email2}`);
    }
    const existing2 = await prisma.weddingMember.findUnique({
      where: { userId_weddingId: { userId: user2.id, weddingId: wedding.id } },
    });
    if (!existing2) {
      await prisma.weddingMember.create({
        data: { userId: user2.id, weddingId: wedding.id, role: "ADMIN" },
      });
      console.log(`Linked ${email2} to wedding as ADMIN`);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Seed reference data (per-wedding, only if empty)
  // -------------------------------------------------------------------------
  const weddingId = wedding.id;

  // SupplierCategory
  const supplierCatCount = await prisma.supplierCategory.count({ where: { weddingId } });
  if (supplierCatCount === 0) {
    const cats = [
      "Venue","Catering","Photography","Videography","Florist",
      "Music / DJ","Cake","Dress / Attire","Transport",
      "Stationery","Hair & Makeup","Jewellery","Accommodation","Other",
    ];
    for (let i = 0; i < cats.length; i++) {
      await prisma.supplierCategory.create({
        data: { weddingId, name: cats[i], sortOrder: i * 10, colour: "#6366f1" },
      });
    }
    console.log("Seeded supplier categories");
  }

  // AppointmentCategory
  const apptCatCount = await prisma.appointmentCategory.count({ where: { weddingId } });
  if (apptCatCount === 0) {
    const cats = [
      { name: "Fitting", colour: "#ec4899" },
      { name: "Tasting", colour: "#f59e0b" },
      { name: "Rehearsal", colour: "#3b82f6" },
      { name: "Consultation", colour: "#a855f7" },
      { name: "Viewing", colour: "#14b8a6" },
      { name: "Ceremony Practice", colour: "#6366f1" },
      { name: "Other", colour: "#6b7280" },
    ];
    for (let i = 0; i < cats.length; i++) {
      await prisma.appointmentCategory.create({
        data: { weddingId, ...cats[i], sortOrder: i * 10 },
      });
    }
    console.log("Seeded appointment categories");
  }

  // TaskCategory
  const taskCatCount = await prisma.taskCategory.count({ where: { weddingId } });
  if (taskCatCount === 0) {
    const cats = [
      { name: "Admin",       colour: "#64748b" },
      { name: "Venue",       colour: "#14b8a6" },
      { name: "Catering",    colour: "#f59e0b" },
      { name: "Attire",      colour: "#ec4899" },
      { name: "Flowers",     colour: "#22c55e" },
      { name: "Photography", colour: "#3b82f6" },
      { name: "Music",       colour: "#a855f7" },
      { name: "Stationery",  colour: "#f97316" },
      { name: "Transport",   colour: "#06b6d4" },
      { name: "Honeymoon",   colour: "#6366f1" },
      { name: "Other",       colour: "#6b7280" },
    ];
    for (let i = 0; i < cats.length; i++) {
      await prisma.taskCategory.create({
        data: { weddingId, ...cats[i], sortOrder: i * 10 },
      });
    }
    console.log("Seeded task categories");
  }

  console.log("==> Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
