import { MercadoPagoConfig, Payment as MPPayment } from "mercadopago";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError.js";
import { OrderRepository } from "../repositories/OrderRepository.js";
import { PaymentRepository } from "../repositories/PaymentRepository.js";
import { ProductRepository } from "../repositories/ProductRepository.js";
import {
  emitOrderCreated,
  emitOrderStatusUpdated,
  emitPaymentUpdated,
} from "../realtime/socketServer.js";

const ORDER_TRANSITIONS = {
  RECEBIDO: ["PREPARANDO"],
  PREPARANDO: ["NO_FORNO"],
  NO_FORNO: ["SAIU_PARA_ENTREGA"],
  SAIU_PARA_ENTREGA: ["ENTREGUE"],
  ENTREGUE: [],
};

const PAYMENT_STATUS_MAP = {
  approved: "APROVADO",
  rejected: "RECUSADO",
  cancelled: "RECUSADO",
  refunded: "ESTORNADO",
  in_process: "PENDENTE",
  pending: "PENDENTE",
};

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (value) => (value / 100).toFixed(2);
const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

export class OrderService {
  constructor(
    orderRepository = new OrderRepository(),
    productRepository = new ProductRepository(),
    paymentRepository = new PaymentRepository(),
  ) {
    this.orderRepository = orderRepository;
    this.productRepository = productRepository;
    this.paymentRepository = paymentRepository;
  }

  async createOrder({ userId, deliveryAddress, notes, items, paymentMethod }) {
    if (!items?.length) {
      throw new AppError("Pedido deve conter ao menos 1 item.", 422);
    }

    const normalizedItems = [];

    for (const item of items) {
      if (item.type === "INTEIRA") {
        const normalized = await this.#normalizeWholeItem(item);
        normalizedItems.push(normalized);
        continue;
      }

      if (item.type === "MEIO_A_MEIO") {
        const normalized = await this.#normalizeHalfHalfItem(item);
        normalizedItems.push(normalized);
        continue;
      }

      throw new AppError("Tipo de item invalido.", 422);
    }

    const totalCents = normalizedItems.reduce(
      (acc, item) => acc + item.totalPriceCents,
      0,
    );

    const order = await this.orderRepository.createOrder({
      userId,
      deliveryAddress,
      notes,
      total: new Prisma.Decimal(fromCents(totalCents)),
      paymentStatus: "PENDENTE",
      items: {
        create: normalizedItems.map((item) => ({
          quantity: item.quantity,
          type: item.type,
          size: item.size,
          unitPrice: new Prisma.Decimal(fromCents(item.unitPriceCents)),
          totalPrice: new Prisma.Decimal(fromCents(item.totalPriceCents)),
          productId: item.productId,
          firstHalfProductId: item.firstHalfProductId,
          secondHalfProductId: item.secondHalfProductId,
        })),
      },
      payment: {
        create: {
          provider: "MERCADO_PAGO",
          amount: new Prisma.Decimal(fromCents(totalCents)),
          status: "PENDENTE",
          payload: {
            paymentMethod: paymentMethod || "nao_informado",
          },
        },
      },
    });

    emitOrderCreated({
      orderId: order.id,
      userId: order.userId,
      status: order.status,
      total: Number(order.total),
    });

    return order;
  }

  async cancelOrder(orderId) {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new AppError("Pedido nao encontrado.", 404);
    }

    if (order.status === "ENTREGUE") {
      throw new AppError("Pedido ja entregue nao pode ser cancelado.", 409);
    }

    if (order.status === "CANCELADO") {
      throw new AppError("Pedido ja esta cancelado.", 409);
    }

    const updatedOrder = await this.orderRepository.updateStatus(
      orderId,
      "CANCELADO",
    );

    emitOrderStatusUpdated({
      orderId: updatedOrder.id,
      userId: order.userId,
      previousStatus: order.status,
      status: "CANCELADO",
    });

    return updatedOrder;
  }

  async updateOrderStatus(orderId, nextStatus) {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new AppError("Pedido nao encontrado.", 404);
    }

    const allowedTransitions = ORDER_TRANSITIONS[order.status] ?? [];

    if (!allowedTransitions.includes(nextStatus)) {
      throw new AppError(
        `Transicao invalida de ${order.status} para ${nextStatus}.`,
        409,
      );
    }

    const deliveredAt = nextStatus === "ENTREGUE" ? new Date() : null;
    const updatedOrder = await this.orderRepository.updateStatus(
      orderId,
      nextStatus,
      deliveredAt,
    );

    emitOrderStatusUpdated({
      orderId: updatedOrder.id,
      userId: order.userId,
      previousStatus: order.status,
      status: updatedOrder.status,
    });

    return updatedOrder;
  }

  async handlePaymentWebhook(payload) {
    // MP sends { type: "payment", data: { id: "<payment_id>" } } — no status inline.
    // We must call the MP API to get the real payment status + external_reference.
    const rawPaymentId = payload?.data?.id ?? payload?.id;
    let providerStatus = "pending";
    let orderId =
      payload?.external_reference ??
      payload?.data?.metadata?.order_id ??
      payload?.metadata?.order_id;
    let externalId = String(rawPaymentId ?? "");

    if (rawPaymentId && process.env.MP_ACCESS_TOKEN) {
      try {
        const client = new MercadoPagoConfig({
          accessToken: process.env.MP_ACCESS_TOKEN,
        });
        const paymentApi = new MPPayment(client);
        const paymentData = await paymentApi.get({ id: String(rawPaymentId) });
        providerStatus = (paymentData.status ?? "pending").toLowerCase();
        orderId = orderId || paymentData.external_reference;
        externalId = String(paymentData.id ?? rawPaymentId);
      } catch {
        // fall through with defaults
      }
    } else {
      providerStatus = String(
        payload?.data?.status ?? payload?.status ?? "pending",
      ).toLowerCase();
    }

    const paymentStatus = PAYMENT_STATUS_MAP[providerStatus] ?? "PENDENTE";

    if (!orderId) {
      throw new AppError(
        "Webhook sem order_id no metadata/external_reference.",
        422,
      );
    }

    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new AppError("Pedido nao encontrado para o webhook recebido.", 404);
    }

    await this.paymentRepository.upsertFromWebhook({
      orderId,
      externalId: externalId || null,
      status: paymentStatus,
      payload,
      amount: order.total,
    });

    await this.orderRepository.updatePaymentStatus(orderId, paymentStatus);

    emitPaymentUpdated({
      orderId,
      userId: order.userId,
      paymentStatus,
    });

    return {
      orderId,
      paymentStatus,
    };
  }

  async adminSetPaymentStatus(orderId, paymentStatus) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new AppError("Pedido não encontrado.", 404);
    return this.orderRepository.updatePaymentStatus(orderId, paymentStatus);
  }

  async listOrdersByUser(userId) {
    return this.orderRepository.findByUserId(userId);
  }

  async listActiveOrders() {
    const orders = await this.orderRepository.findAllActive();
    return orders.filter((o) => o.status !== "CANCELADO");
  }

  async getSalesAnalytics() {
    const orders = await this.orderRepository.findAllForAnalytics();
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setDate(last7DaysStart.getDate() - 6);

    const paidOrders = orders.filter(
      (order) => order.paymentStatus === "APROVADO",
    );
    const paidToday = paidOrders.filter(
      (order) => new Date(order.createdAt) >= todayStart,
    );
    const paidThisMonth = paidOrders.filter(
      (order) => new Date(order.createdAt) >= monthStart,
    );
    const averageTicket = paidOrders.length
      ? paidOrders.reduce((sum, order) => sum + Number(order.total), 0) /
        paidOrders.length
      : 0;

    const statusCounts = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});

    const dailySalesMap = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(last7DaysStart);
      date.setDate(last7DaysStart.getDate() + offset);
      const key = date.toISOString().slice(0, 10);
      dailySalesMap.set(key, 0);
    }

    for (const order of paidOrders) {
      const createdAt = new Date(order.createdAt);
      if (createdAt < last7DaysStart) {
        continue;
      }

      const key = createdAt.toISOString().slice(0, 10);
      if (dailySalesMap.has(key)) {
        dailySalesMap.set(key, dailySalesMap.get(key) + Number(order.total));
      }
    }

    const topProductsMap = new Map();
    for (const order of paidOrders) {
      for (const item of order.items ?? []) {
        if (item.type === "INTEIRA" && item.product?.name) {
          topProductsMap.set(
            item.product.name,
            (topProductsMap.get(item.product.name) ?? 0) + item.quantity,
          );
          continue;
        }

        if (item.firstHalf?.name) {
          topProductsMap.set(
            item.firstHalf.name,
            (topProductsMap.get(item.firstHalf.name) ?? 0) + item.quantity,
          );
        }

        if (item.secondHalf?.name) {
          topProductsMap.set(
            item.secondHalf.name,
            (topProductsMap.get(item.secondHalf.name) ?? 0) + item.quantity,
          );
        }
      }
    }

    const topProducts = [...topProductsMap.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      summary: {
        totalRevenue: Number(
          paidOrders
            .reduce((sum, order) => sum + Number(order.total), 0)
            .toFixed(2),
        ),
        revenueToday: Number(
          paidToday
            .reduce((sum, order) => sum + Number(order.total), 0)
            .toFixed(2),
        ),
        revenueThisMonth: Number(
          paidThisMonth
            .reduce((sum, order) => sum + Number(order.total), 0)
            .toFixed(2),
        ),
        ordersCount: orders.length,
        paidOrdersCount: paidOrders.length,
        averageTicket: Number(averageTicket.toFixed(2)),
      },
      statusCounts,
      dailySales: [...dailySalesMap.entries()].map(([date, revenue]) => ({
        date,
        revenue: Number(revenue.toFixed(2)),
      })),
      topProducts,
    };
  }

  async getOrderById(orderId) {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new AppError("Pedido nao encontrado.", 404);
    }

    return order;
  }

  async #normalizeWholeItem(item) {
    const quantity = item.quantity ?? 1;
    if (!item.productId || !item.size) {
      throw new AppError("Item INTEIRA exige productId e size.", 422);
    }

    const priceBySize = await this.productRepository.findSizePrice(
      item.productId,
      item.size,
    );

    if (!priceBySize) {
      throw new AppError("Produto ou tamanho invalido para item INTEIRA.", 422);
    }

    const unitPriceCents = toCents(priceBySize.price);
    const totalPriceCents = unitPriceCents * quantity;

    return {
      quantity,
      type: "INTEIRA",
      size: item.size,
      unitPriceCents,
      totalPriceCents,
      productId: item.productId,
      firstHalfProductId: null,
      secondHalfProductId: null,
    };
  }

  async #normalizeHalfHalfItem(item) {
    const quantity = item.quantity ?? 1;

    if (!item.firstHalfProductId || !item.secondHalfProductId || !item.size) {
      throw new AppError(
        "Item MEIO_A_MEIO exige firstHalfProductId, secondHalfProductId e size.",
        422,
      );
    }

    const [firstHalfPrice, secondHalfPrice] = await Promise.all([
      this.productRepository.findSizePrice(item.firstHalfProductId, item.size),
      this.productRepository.findSizePrice(item.secondHalfProductId, item.size),
    ]);

    if (!firstHalfPrice || !secondHalfPrice) {
      throw new AppError(
        "Sabor(es) invalidos para pizza meio a meio no tamanho selecionado.",
        422,
      );
    }

    const firstHalfCents = toCents(firstHalfPrice.price);
    const secondHalfCents = toCents(secondHalfPrice.price);

    const unitPriceCents = Math.max(firstHalfCents, secondHalfCents);
    const totalPriceCents = unitPriceCents * quantity;

    return {
      quantity,
      type: "MEIO_A_MEIO",
      size: item.size,
      unitPriceCents,
      totalPriceCents,
      productId: null,
      firstHalfProductId: item.firstHalfProductId,
      secondHalfProductId: item.secondHalfProductId,
    };
  }
}
