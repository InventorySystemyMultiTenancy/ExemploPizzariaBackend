import express from "express";
import cors from "cors";
import { AuthController } from "./controllers/AuthController.js";
import { OrderController } from "./controllers/OrderController.js";
import { PaymentController } from "./controllers/PaymentController.js";
import { ProductController } from "./controllers/ProductController.js";
import {
  authenticateToken,
  authorizeRoles,
  enforceOrderOwnership,
} from "./middlewares/authMiddleware.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";

const app = express();
const authController = new AuthController();
const orderController = new OrderController();
const paymentController = new PaymentController();
const productController = new ProductController();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  return res.status(200).json({ status: "ok" });
});

// Public product routes
app.get("/api/products", (req, res, next) =>
  productController.list(req, res, next),
);
app.get("/api/products/:productId", (req, res, next) =>
  productController.getById(req, res, next),
);

// Admin product management routes
app.get(
  "/api/admin/products",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => productController.listAdmin(req, res, next),
);
app.post(
  "/api/admin/products",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => productController.create(req, res, next),
);
app.put(
  "/api/admin/products/:productId",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => productController.update(req, res, next),
);
app.delete(
  "/api/admin/products/:productId",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => productController.deactivate(req, res, next),
);
app.patch(
  "/api/admin/products/:productId/restore",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => productController.restore(req, res, next),
);

app.post("/api/auth/register", (req, res, next) =>
  authController.register(req, res, next),
);

app.post("/api/auth/login", (req, res, next) =>
  authController.login(req, res, next),
);

app.post(
  "/api/auth/users",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res, next) => authController.createUserByAdmin(req, res, next),
);

app.get(
  "/api/orders",
  authenticateToken,
  authorizeRoles("ADMIN", "FUNCIONARIO", "COZINHA"),
  (req, res, next) => orderController.listAll(req, res, next),
);

app.get(
  "/api/admin/analytics",
  authenticateToken,
  authorizeRoles("ADMIN", "FUNCIONARIO"),
  (req, res, next) => orderController.analytics(req, res, next),
);

app.post(
  "/api/orders",
  authenticateToken,
  authorizeRoles("CLIENTE", "ADMIN"),
  (req, res, next) => orderController.create(req, res, next),
);

app.get(
  "/api/orders/me",
  authenticateToken,
  authorizeRoles("CLIENTE"),
  (req, res, next) => orderController.getMyOrders(req, res, next),
);

app.get(
  "/api/orders/:orderId",
  authenticateToken,
  authorizeRoles("CLIENTE", "ADMIN", "COZINHA", "FUNCIONARIO"),
  enforceOrderOwnership,
  (req, res, next) => orderController.getById(req, res, next),
);

app.patch(
  "/api/orders/:orderId/status",
  authenticateToken,
  authorizeRoles("ADMIN", "COZINHA", "FUNCIONARIO"),
  (req, res, next) => orderController.updateStatus(req, res, next),
);

app.patch(
  "/api/orders/:orderId/payment-status",
  authenticateToken,
  authorizeRoles("ADMIN", "FUNCIONARIO"),
  (req, res, next) => orderController.adminUpdatePaymentStatus(req, res, next),
);

app.post("/api/payments/webhook", (req, res, next) =>
  orderController.paymentWebhook(req, res, next),
);

// MP IPN validation — sends GET to confirm the endpoint is alive
app.get("/api/payments/webhook", (_req, res) => {
  return res.status(200).json({ status: "ok" });
});

app.post("/api/payments/preference", authenticateToken, (req, res, next) =>
  paymentController.createPreference(req, res, next),
);

app.use(errorMiddleware);

export { app };
