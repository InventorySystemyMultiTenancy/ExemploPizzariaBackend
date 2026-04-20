import { prisma } from "../lib/prisma.js";

export class OrderRepository {
  // Helpers: Prisma v6 não suporta arrays em $queryRaw template tags;
  // usamos $queryRawUnsafe com placeholders IN ($1, $2, ...) em vez de ANY($1::text[])
  async _fetchItemsForOrders(orderIds) {
    if (!orderIds.length) return [];
    const ph = orderIds.map((_, i) => `$${i + 1}`).join(", ");
    return prisma.$queryRawUnsafe(
      `SELECT oi.*, p.name AS "productName",
              fp.name AS "firstHalfProductName",
              sp.name AS "secondHalfProductName"
       FROM "OrderItem" oi
       LEFT JOIN "Product" p ON p.id = oi."productId"
       LEFT JOIN "Product" fp ON fp.id = oi."firstHalfProductId"
       LEFT JOIN "Product" sp ON sp.id = oi."secondHalfProductId"
       WHERE oi."orderId" IN (${ph})`,
      ...orderIds,
    );
  }

  async _fetchPaymentsForOrders(orderIds) {
    if (!orderIds.length) return [];
    const ph = orderIds.map((_, i) => `$${i + 1}`).join(", ");
    return prisma.$queryRawUnsafe(
      `SELECT * FROM "Payment" WHERE "orderId" IN (${ph})`,
      ...orderIds,
    );
  }

  async _fetchUsersForOrders(orderIds) {
    if (!orderIds.length) return [];
    const ph = orderIds.map((_, i) => `$${i + 1}`).join(", ");
    return prisma.$queryRawUnsafe(
      `SELECT u.id, u.name FROM "User" u
       WHERE u.id IN (
         SELECT DISTINCT "userId" FROM "Order" WHERE id IN (${ph})
       )`,
      ...orderIds,
    );
  }

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
    const rows = await prisma.$queryRaw`
      SELECT o.id, o."userId", o.status::text AS status,
             o."paymentStatus"::text AS "paymentStatus",
             o."deliveryAddress", o.notes, o."paymentMethod",
             o."deliveryFee", o."deliveryLat", o."deliveryLon",
             o."createdAt", o."updatedAt", o."deliveredAt"
      FROM "Order" o WHERE o.id = ${orderId}
    `;
    if (!rows.length) return null;
    const order = rows[0];

    const items = await prisma.$queryRaw`
      SELECT oi.*, p.name AS "productName",
             fp.name AS "firstHalfProductName",
             sp.name AS "secondHalfProductName"
      FROM "OrderItem" oi
      LEFT JOIN "Product" p ON p.id = oi."productId"
      LEFT JOIN "Product" fp ON fp.id = oi."firstHalfProductId"
      LEFT JOIN "Product" sp ON sp.id = oi."secondHalfProductId"
      WHERE oi."orderId" = ${orderId}
    `;
    const payments = await prisma.$queryRaw`
      SELECT * FROM "Payment" WHERE "orderId" = ${orderId}
    `;
    return { ...order, items, payment: payments[0] ?? null };
  }

  async findByIdWithUser(orderId) {
    const rows = await prisma.$queryRaw`
      SELECT o.id, o."userId", o.status::text AS status,
             o."paymentStatus"::text AS "paymentStatus",
             u.id AS "uId", u.role::text AS "uRole"
      FROM "Order" o
      LEFT JOIN "User" u ON u.id = o."userId"
      WHERE o.id = ${orderId}
    `;
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.userId,
      status: r.status,
      paymentStatus: r.paymentStatus,
      user: { id: r.uId, role: r.uRole },
    };
  }

  async updateStatus(orderId, status, deliveredAt = null) {
    // Usa raw SQL para todos os updates de status para evitar problemas
    // com o Prisma Client desatualizado que não conhece CANCELADO
    const deliveredClause = deliveredAt
      ? `, "deliveredAt" = '${new Date(deliveredAt).toISOString()}'`
      : "";
    await prisma.$executeRawUnsafe(
      `UPDATE "Order" SET "status" = $1::"OrderStatus", "updatedAt" = NOW()${deliveredClause} WHERE "id" = $2`,
      status,
      orderId,
    );
    return this.findById(orderId);
  }

  async updatePaymentStatus(orderId, paymentStatus) {
    return prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus },
    });
  }

  async findByUserId(userId) {
    // Usa raw SQL para evitar falha do Prisma Client ao deserializar
    // enums adicionados depois da geração do client (ex: CANCELADO)
    const orders = await prisma.$queryRaw`
      SELECT
        o.id, o."userId", o.status::text AS status,
        o."paymentStatus"::text AS "paymentStatus",
        o."deliveryAddress", o.notes, o."paymentMethod",
        o."deliveryFee", o."deliveryLat", o."deliveryLon",
        o."createdAt", o."updatedAt", o."deliveredAt"
      FROM "Order" o
      WHERE o."userId" = ${userId}
      ORDER BY o."createdAt" DESC
    `;

    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.id);

    const items = await this._fetchItemsForOrders(orderIds);
    const payments = await this._fetchPaymentsForOrders(orderIds);

    return orders.map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id),
      payment: payments.find((p) => p.orderId === o.id) ?? null,
    }));
  }

  async findAllActive() {
    // Raw SQL: exclui ENTREGUE e CANCELADO (CANCELADO não existe no client gerado)
    const orders = await prisma.$queryRaw`
      SELECT
        o.id, o."userId", o.status::text AS status,
        o."paymentStatus"::text AS "paymentStatus",
        o."deliveryAddress", o.notes, o."paymentMethod",
        o."deliveryFee", o."deliveryLat", o."deliveryLon",
        o."createdAt", o."updatedAt", o."deliveredAt"
      FROM "Order" o
      WHERE o.status::text NOT IN ('ENTREGUE','CANCELADO')
      ORDER BY o."createdAt" ASC
    `;

    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.id);

    const items = await this._fetchItemsForOrders(orderIds);
    const users = await this._fetchUsersForOrders(orderIds);

    return orders.map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id),
      user: users.find((u) => u.id === o.userId) ?? null,
    }));
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

    // Constrói cláusulas WHERE dinamicamente para raw SQL
    const conditions = [];
    const params = [];
    let idx = 1;

    if (clientName) {
      conditions.push(`u.name ILIKE $${idx}`);
      params.push(`%${clientName}%`);
      idx++;
    }
    if (dateFrom) {
      conditions.push(`o."createdAt" >= $${idx}`);
      params.push(new Date(dateFrom));
      idx++;
    }
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(`o."createdAt" <= $${idx}`);
      params.push(end);
      idx++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const limitClause = hasFilter ? "" : "LIMIT 15";

    const orders = await prisma.$queryRawUnsafe(
      `SELECT o.id, o."userId", o.status::text AS status,
              o."paymentStatus"::text AS "paymentStatus",
              o."deliveryAddress", o.notes, o."paymentMethod",
              o."deliveryFee", o."deliveryLat", o."deliveryLon",
              o."createdAt", o."updatedAt", o."deliveredAt",
              u.name AS "userName"
       FROM "Order" o
       LEFT JOIN "User" u ON u.id = o."userId"
       ${whereClause}
       ORDER BY o."createdAt" DESC
       ${limitClause}`,
      ...params,
    );

    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.id);

    const items = await this._fetchItemsForOrders(orderIds);
    const payments = await this._fetchPaymentsForOrders(orderIds);

    return orders.map((o) => ({
      ...o,
      user: { id: o.userId, name: o.userName },
      items: items.filter((i) => i.orderId === o.id),
      payment: payments.find((p) => p.orderId === o.id) ?? null,
    }));
  }

  async findAllForAnalytics() {
    const orders = await prisma.$queryRaw`
      SELECT o.id, o."userId", o.status::text AS status,
             o."paymentStatus"::text AS "paymentStatus",
             o."deliveryAddress", o."paymentMethod",
             o."deliveryFee", o."createdAt", o."updatedAt", o."deliveredAt"
      FROM "Order" o
      ORDER BY o."createdAt" ASC
    `;

    if (!orders.length) return [];

    const orderIds = orders.map((o) => o.id);

    const items = await this._fetchItemsForOrders(orderIds);

    return orders.map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id),
    }));
  }
}
