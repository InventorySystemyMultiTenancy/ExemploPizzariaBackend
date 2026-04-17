import { prisma } from "../lib/prisma.js";

export class ProductRepository {
  async findAll() {
    return prisma.product.findMany({
      where: { isActive: true },
      include: { sizes: { orderBy: { size: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async findAllForAdmin() {
    return prisma.product.findMany({
      include: { sizes: { orderBy: { size: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async create({ name, description, imageUrl, category, sizes }) {
    return prisma.product.create({
      data: {
        name,
        description: description ?? null,
        imageUrl: imageUrl ?? null,
        category: category ?? "Geral",
        sizes: {
          create: sizes.map(({ size, price }) => ({ size, price })),
        },
      },
      include: { sizes: { orderBy: { size: "asc" } } },
    });
  }

  async update(productId, { name, description, imageUrl, category, sizes }) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: productId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(category !== undefined && { category }),
        },
      });

      if (sizes) {
        await tx.productSize.deleteMany({ where: { productId } });
        await tx.productSize.createMany({
          data: sizes.map(({ size, price }) => ({ productId, size, price })),
        });
      }

      return tx.product.findUnique({
        where: { id: productId },
        include: { sizes: { orderBy: { size: "asc" } } },
      });
    });
  }

  async setActive(productId, isActive) {
    return prisma.product.update({
      where: { id: productId },
      data: { isActive },
    });
  }

  async findByIdWithSizes(productId) {
    return prisma.product.findUnique({
      where: { id: productId },
      include: { sizes: true },
    });
  }

  async findSizePrice(productId, size) {
    return prisma.productSize.findUnique({
      where: {
        productId_size: {
          productId,
          size,
        },
      },
    });
  }
}
