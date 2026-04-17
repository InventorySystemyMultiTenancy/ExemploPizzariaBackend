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
      const order = await orderService.createOrder({
        userId: req.user.id,
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

  async analytics(_req, res, next) {
    try {
      const analytics = await orderService.getSalesAnalytics();

      return res.status(200).json({
        data: analytics,
      });
    } catch (error) {
      return this.#handleError(error, next);
    }
  }

  async paymentWebhook(req, res, next) {
    try {
      const payload = paymentWebhookSchema.parse(req.body);
      const result = await orderService.handlePaymentWebhook(payload);

      return res.status(200).json({
        message: "Webhook processado com sucesso.",
        data: result,
      });
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
