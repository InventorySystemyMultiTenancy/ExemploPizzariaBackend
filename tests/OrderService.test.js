import { describe, expect, it, vi } from "vitest";
import { OrderService } from "../src/services/OrderService.js";
import { AppError } from "../src/errors/AppError.js";

describe("OrderService", () => {
  it("deve calcular pizza meio a meio pelo maior preco", async () => {
    const orderRepository = {
      createOrder: vi.fn(async (data) => data),
    };

    const productRepository = {
      findSizePrice: vi
        .fn()
        .mockResolvedValueOnce({ price: 45.9 })
        .mockResolvedValueOnce({ price: 59.9 }),
    };

    const paymentRepository = {};

    const service = new OrderService(
      orderRepository,
      productRepository,
      paymentRepository,
    );

    const result = await service.createOrder({
      userId: "user-1",
      deliveryAddress: "Rua das Palmeiras, 123",
      items: [
        {
          type: "MEIO_A_MEIO",
          firstHalfProductId: "produto-a",
          secondHalfProductId: "produto-b",
          size: "GRANDE",
          quantity: 2,
        },
      ],
      paymentMethod: "pix",
    });

    expect(productRepository.findSizePrice).toHaveBeenCalledTimes(2);
    expect(Number(result.items.create[0].unitPrice)).toBe(59.9);
    expect(Number(result.items.create[0].totalPrice)).toBe(119.8);
    expect(Number(result.total)).toBe(119.8);
  });

  it("deve somar a borda recheada ao valor da pizza", async () => {
    const orderRepository = {
      createOrder: vi.fn(async (data) => data),
    };

    const productRepository = {
      findSizePrice: vi
        .fn()
        .mockResolvedValueOnce({ price: 52.9 })
        .mockResolvedValueOnce({ price: 8 }),
    };

    const service = new OrderService(orderRepository, productRepository, {});

    const result = await service.createOrder({
      userId: "user-1",
      deliveryAddress: "Rua das Palmeiras, 123",
      items: [
        {
          type: "INTEIRA",
          productId: "produto-a",
          crustProductId: "borda-a",
          size: "GRANDE",
          quantity: 1,
        },
      ],
      paymentMethod: "pix",
    });

    expect(productRepository.findSizePrice).toHaveBeenCalledTimes(2);
    expect(Number(result.items.create[0].crustUnitPrice)).toBe(8);
    expect(Number(result.items.create[0].unitPrice)).toBe(60.9);
    expect(Number(result.total)).toBe(60.9);
  });

  it("deve permitir transicao valida de status", async () => {
    const orderRepository = {
      findById: vi.fn(async () => ({ id: "order-1", status: "RECEBIDO" })),
      updateStatus: vi.fn(async (_id, status) => ({ status })),
    };

    const service = new OrderService(orderRepository, {}, {});

    const updated = await service.updateOrderStatus("order-1", "PREPARANDO");

    expect(updated.status).toBe("PREPARANDO");
    expect(orderRepository.updateStatus).toHaveBeenCalledOnce();
  });

  it("deve bloquear transicao invalida de status", async () => {
    const orderRepository = {
      findById: vi.fn(async () => ({ id: "order-1", status: "RECEBIDO" })),
      updateStatus: vi.fn(),
    };

    const service = new OrderService(orderRepository, {}, {});

    await expect(
      service.updateOrderStatus("order-1", "NO_FORNO"),
    ).rejects.toBeInstanceOf(AppError);

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });
});
