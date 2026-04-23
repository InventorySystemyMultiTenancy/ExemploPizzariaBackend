import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import { OrderService } from "../services/OrderService.js";
import {
  createOrderSchema,
  paymentWebhookSchema,
  updateOrderStatusSchema,
} from "../validators/orderSchemas.js";

const orderService = new OrderService();

export class OrderController {
  async create(req, res, next) {
    try {
      const payload = createOrderSchema.parse(req.body);
      const isMesa = req.user.role === "MESA";
      const order = await orderService.createOrder({
        ...(isMesa ? { mesaId: req.user.id } : { userId: req.user.id }),
        ...payload,
      });

      return res.status(201).json({
        message: "Pedido criado com sucesso.",
        data: order,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { status } = updateOrderStatusSchema.parse(req.body);
      const updatedOrder = await orderService.updateOrderStatus(
        req.params.orderId,
        status,
      );

      return res.status(200).json({
        message: "Status do pedido atualizado.",
        data: updatedOrder,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async getById(req, res, next) {
    try {
      const order = await orderService.getOrderById(req.params.orderId);

      return res.status(200).json({
        data: order,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async getMyOrders(req, res, next) {
    try {
      const orders = await orderService.listOrdersByUser(req.user.id);

      return res.status(200).json({
        data: orders,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async listAll(_req, res, next) {
    try {
      const orders = await orderService.listActiveOrders();

      return res.status(200).json({
        data: orders,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async motoboyOrders(_req, res, next) {
    try {
      const orders = await orderService.listMotoboyOrders();
      return res.status(200).json({ data: orders });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async history(req, res, next) {
    try {
      const { clientName, dateFrom, dateTo } = req.query;
      const orders = await orderService.listOrderHistory({
        clientName: clientName || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      return res.status(200).json({ data: orders });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async cancel(req, res, next) {
    try {
      const updatedOrder = await orderService.cancelOrder(req.params.orderId);

      return res.status(200).json({
        message: "Pedido cancelado.",
        data: updatedOrder,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async analytics(req, res, next) {
    try {
      const { from, to } = req.query;
      const analytics = await orderService.getSalesAnalytics({ from, to });

      return res.status(200).json({
        data: analytics,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async adminUpdatePaymentStatus(req, res, next) {
    try {
      const { paymentStatus } = req.body;
      const ALLOWED = ["APROVADO", "PENDENTE", "RECUSADO"];
      if (!ALLOWED.includes(paymentStatus)) {
        throw new AppError("paymentStatus inválido.", 422);
      }
      const order = await orderService.adminSetPaymentStatus(
        req.params.orderId,
        paymentStatus,
      );
      return res
        .status(200)
        .json({ message: "Status de pagamento atualizado.", data: order });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async paymentWebhook(req, res, next) {
    const ts = new Date().toISOString();
    console.log(`\n[webhook] ========== RECEBIDO ${ts} ==========`);
    console.log(
      "[webhook] headers type:",
      req.headers["x-signature"] ? "com x-signature" : "sem x-signature",
    );
    console.log("[webhook] query:", JSON.stringify(req.query));
    console.log("[webhook] raw body:", JSON.stringify(req.body));

    try {
      // Mescla query params + body para suportar IPN (query string) e Webhook (body) simultaneamente.
      // IPN legado: POST /webhook?id=123&topic=payment (body vazio)
      // Webhook moderno: POST /webhook com JSON no body
      // Body tem prioridade sobre query em caso de conflito.
      const rawPayload = { ...req.query, ...req.body };
      const payload = paymentWebhookSchema.parse(rawPayload);

      // Responde 200 imediatamente ao Mercado Pago (obrigatório — evita retries em loop)
      res.status(200).json({ message: "OK" });

      // Processa em background sem bloquear a resposta
      orderService.handlePaymentWebhook(payload).catch((err) => {
        console.error(
          "[webhook] Erro ao processar payload em background:",
          err.message,
          err.stack,
        );
      });
    } catch (error) {
      // Mesmo em caso de parse error, responde 200 para evitar retry do MP
      res.status(200).json({ message: "OK" });
      console.error(
        "[webhook] Parse error:",
        error.message,
        "body:",
        JSON.stringify(req.body),
      );
    }
  }

  async assignMotoboy(req, res, next) {
    try {
      const { motoboyId } = req.body;
      if (!motoboyId || typeof motoboyId !== "string") {
        throw new AppError("motoboyId é obrigatório.", 422);
      }
      await orderService.assignMotoboy(req.params.orderId, motoboyId);
      return res.status(200).json({ message: "Motoboy atribuído." });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async deleteOrder(req, res, next) {
    try {
      await orderService.deleteOrder(req.params.orderId, req.user.id);
      return res.status(200).json({ message: "Pedido excluido com sucesso." });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async confirmDelivery(req, res, next) {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        throw new AppError("Código é obrigatório.", 422);
      }
      const order = await orderService.confirmDelivery(
        req.params.orderId,
        code.trim(),
      );
      return res
        .status(200)
        .json({ message: "Entrega confirmada.", data: order });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  #handleError(error, next) {
    if (error instanceof ZodError) {
      return next(new AppError("Payload invalido.", 422, error.flatten()));
    }

    return next(error);
  }
}
