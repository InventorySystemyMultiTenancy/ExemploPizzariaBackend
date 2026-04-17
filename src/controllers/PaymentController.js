import { MercadoPagoConfig, Preference } from "mercadopago";
import { AppError } from "../errors/AppError.js";
import { OrderRepository } from "../repositories/OrderRepository.js";

const orderRepository = new OrderRepository();

export class PaymentController {
  async createPreference(req, res, next) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        throw new AppError("orderId obrigatorio.", 422);
      }

      const order = await orderRepository.findById(orderId);

      if (!order) {
        throw new AppError("Pedido nao encontrado.", 404);
      }

      if (order.userId !== req.user.id && req.user.role !== "ADMIN") {
        throw new AppError("Acesso negado.", 403);
      }

      const accessToken = process.env.MP_ACCESS_TOKEN;
      if (!accessToken) {
        throw new AppError("Mercado Pago nao configurado.", 500);
      }

      const client = new MercadoPagoConfig({ accessToken });
      const preferenceApi = new Preference(client);

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "https://exemplopizzaria.selfmachine.com.br";

      const preference = await preferenceApi.create({
        body: {
          items: [
            {
              id: order.id,
              title: "Pedido Pizzaria Fellice",
              description: `Pedido #${order.id.slice(-6).toUpperCase()}`,
              quantity: 1,
              unit_price: Number(order.total),
              currency_id: "BRL",
            },
          ],
          external_reference: order.id,
          back_urls: {
            success: `${frontendUrl}/checkout/retorno`,
            failure: `${frontendUrl}/checkout/retorno`,
            pending: `${frontendUrl}/checkout/retorno`,
          },
          auto_return: "approved",
          notification_url: `${process.env.BACKEND_URL || "https://exemplopizzariabackend.onrender.com"}/api/payments/webhook`,
          statement_descriptor: "PIZZARIA FELLICE",
        },
      });

      return res.status(200).json({
        data: {
          preferenceId: preference.id,
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
}
