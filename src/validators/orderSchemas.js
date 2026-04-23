import { z } from "zod";

const itemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("INTEIRA"),
    productId: z.string().cuid(),
    size: z.enum(["PEQUENA", "MEDIA", "GRANDE", "FAMILIA"]),
    crustProductId: z.string().cuid().optional(),
    quantity: z.number().int().positive().max(20).optional(),
  }),
  z.object({
    type: z.literal("MEIO_A_MEIO"),
    firstHalfProductId: z.string().cuid(),
    secondHalfProductId: z.string().cuid(),
    size: z.enum(["PEQUENA", "MEDIA", "GRANDE", "FAMILIA"]),
    crustProductId: z.string().cuid().optional(),
    quantity: z.number().int().positive().max(20).optional(),
  }),
]);

export const createOrderSchema = z.object({
  deliveryAddress: z.string().min(1).max(255).optional(),
  isPickup: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.string().min(2).max(50).optional(),
  deliveryFee: z.number().nonnegative().optional(),
  deliveryLat: z.number().optional(),
  deliveryLon: z.number().optional(),
  items: z.array(itemSchema).min(1).max(30),
});

export const deliveryFreightSchema = z.object({
  cep: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  numero: z.string().min(1).max(20),
  cidade: z.string().min(2).max(100),
  rua: z.string().max(200).optional(),
  complemento: z.string().max(100).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "RECEBIDO",
    "PREPARANDO",
    "NO_FORNO",
    "SAIU_PARA_ENTREGA",
    "ENTREGUE",
  ]),
});

export const paymentWebhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(), // e.g. "payment", "point_integration_wh"
    topic: z.string().optional(), // formato legado
    resource: z.union([z.string(), z.number()]).optional(), // formato legado
    action: z.string().optional(),
    status: z.string().optional(),
    external_reference: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    additional_info: z.record(z.any()).optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        payment_id: z.union([z.string(), z.number()]).optional(),
        state: z.string().optional(),
        status: z.string().optional(),
        external_reference: z.string().optional(), // nova API /v1/orders
        status_detail: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
