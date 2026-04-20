import { prisma } from "../lib/prisma.js";

// Raw SQL workaround: Prisma Client on Render may be stale (generated before
// phone/cpf/address columns were added). We use $queryRaw/$executeRaw for
// operations involving those columns.

const mapRow = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email ?? null,
  phone: row.phone ?? null,
  cpf: row.cpf ?? null,
  address: row.address ?? null,
  passwordHash: row.passwordHash ?? row.passwordhash,
  role: row.role,
  createdAt: row.createdAt ?? row.createdat,
});

export class UserRepository {
  async findByEmail(email) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE "email" = ${email} LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByPhone(phone) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE "phone" = ${phone} LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByCpf(cpf) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE "cpf" = ${cpf} LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmailOrPhone(identifier) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM "User"
      WHERE "email" = ${identifier} OR "phone" = ${identifier}
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findById(id) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE "id" = ${id} LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create({ name, email, phone, cpf, address, passwordHash, role }) {
    // Use raw SQL for the full insert to bypass the stale Prisma Client enum
    // validation — the ORM was generated before MOTOBOY was added to the Role enum.
    const resolvedRole = role || "CLIENTE";
    const rows = await prisma.$queryRaw`
      INSERT INTO "User" ("id", "name", "email", "phone", "cpf", "address", "passwordHash", "role", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${name},
        ${email ?? null},
        ${phone ?? null},
        ${cpf ?? null},
        ${address ?? null},
        ${passwordHash},
        ${resolvedRole}::"Role",
        NOW(),
        NOW()
      )
      RETURNING "id"
    `;

    const id = rows[0]?.id;
    if (!id) throw new Error("Falha ao criar usuario.");

    return this.findById(id);
  }
}
