import { prisma } from "../lib/prisma.js";

export class OrderRepository {
  async createOrder(data) {
    return prisma.order.create({
      data,
      include: {
        items: true,
        payment: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findById(orderId) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payment: true,
      },
    });
  }

  async findByIdWithUser(orderId) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });
  }

  async updateStatus(orderId, status, deliveredAt = null) {
    // CANCELADO foi adicionado ao enum depois da geração do Prisma Client no Render,
    // portanto usamos raw SQL para evitar falha de validação do client gerado.
    if (status === "CANCELADO") {
      await prisma.$executeRawUnsafe(
        `UPDATE "Order" SET "status" = 'CANCELADO'::"OrderStatus", "updatedAt" = NOW() ${deliveredAt ? `, "deliveredAt" = '${deliveredAt.toISOString()}'` : ""} WHERE "id" = $1`,
        orderId,
      );
      return prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, payment: true },
      });
    }

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(deliveredAt ? { deliveredAt } : {}),
      },
    });
  }

  async updatePaymentStatus(orderId, paymentStatus) {
    return prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus },
    });
  }

  async findByUserId(userId) {
    return prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAllActive() {
    return prisma.order.findMany({
      where: {
        status: { not: "ENTREGUE" },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            firstHalfProduct: { select: { id: true, name: true } },
            secondHalfProduct: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findForMotoboy() {
    return prisma.order.findMany({
      where: { status: "SAIU_PARA_ENTREGA" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            firstHalfProduct: { select: { id: true, name: true } },
            secondHalfProduct: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findAllHistory({ clientName, dateFrom, dateTo } = {}) {
    const hasFilter = clientName || dateFrom || dateTo;
    const where = {};

    if (clientName) {
      where.user = {
        name: { contains: clientName, mode: "insensitive" },
      };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    return prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            firstHalfProduct: { select: { id: true, name: true } },
            secondHalfProduct: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      ...(hasFilter ? {} : { take: 15 }),
    });
  }

  async findAllForAnalytics() {
    return prisma.order.findMany({
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            firstHalfProduct: { select: { id: true, name: true } },
            secondHalfProduct: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
