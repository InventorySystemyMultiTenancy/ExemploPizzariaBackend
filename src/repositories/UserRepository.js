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
    // 1. Insert with only the columns the stale Prisma Client knows about
    const user = await prisma.user.create({
      data: {
        name,
        email: email ?? undefined,
        passwordHash,
        role: role || "CLIENTE",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // 2. Set new columns via raw SQL
    await prisma.$executeRaw`
      UPDATE "User"
      SET
        "phone"   = ${phone ?? null},
        "cpf"     = ${cpf ?? null},
        "address" = ${address ?? null}
      WHERE "id" = ${user.id}
    `;

    // 3. Return the full row
    return this.findById(user.id);
  }
}
