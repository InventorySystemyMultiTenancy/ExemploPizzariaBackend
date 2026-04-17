import { AppError } from "../errors/AppError.js";

export const errorMiddleware = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details,
      },
    });
  }

  return res.status(500).json({
    error: {
      message: "Erro interno do servidor.",
    },
  });
};
