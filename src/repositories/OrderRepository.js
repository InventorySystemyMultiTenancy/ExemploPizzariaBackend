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
            firstHalf: { select: { id: true, name: true } },
            secondHalf: { select: { id: true, name: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async findAllForAnalytics() {
    return prisma.order.findMany({
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true } },
            firstHalf: { select: { id: true, name: true } },
            secondHalf: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}
