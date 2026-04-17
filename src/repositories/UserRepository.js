import { prisma } from "../lib/prisma.js";

export class UserRepository {
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findByPhone(phone) {
    return prisma.user.findUnique({
      where: { phone },
    });
  }

  async findByCpf(cpf) {
    return prisma.user.findUnique({
      where: { cpf },
    });
  }

  async findByEmailOrPhone(identifier) {
    return prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });
  }

  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        cpf: true,
        address: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
