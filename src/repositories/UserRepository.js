import { prisma } from "../lib/prisma.js";
import { randomUUID } from "crypto";

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
    const VALID_ROLES = [
      "ADMIN",
      "FUNCIONARIO",
      "COZINHA",
      "MOTOBOY",
      "CLIENTE",
    ];
    const resolvedRole = VALID_ROLES.includes(role) ? role : "CLIENTE";
    const id = randomUUID();

    // $executeRawUnsafe: the role literal is safe (validated against whitelist above).
    // All user-supplied values are bound parameters ($1–$7), never string-interpolated.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "User" ("id","name","email","phone","cpf","address","passwordHash","role","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'${resolvedRole}'::"Role",NOW(),NOW())`,
      id,
      name,
      email ?? null,
      phone ?? null,
      cpf ?? null,
      address ?? null,
      passwordHash,
    );

    return this.findById(id);
  }
}
