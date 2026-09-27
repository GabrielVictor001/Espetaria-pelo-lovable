import type { Response, NextFunction, RequestHandler } from 'express';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Sessão expirada. Faça login novamente.') => new ApiError(401, msg);
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new ApiError(403, msg);
export const notFound = (msg = 'Registro não encontrado.') => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

/** Encapsula handlers async para que erros caiam no middleware de erro. */
export function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: any, _req: any, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Dados inválidos.',
      details: err.issues?.map((i: any) => `${i.path?.join('.') || 'campo'}: ${i.message}`),
    });
  }
  if (err?.code === '23505' || err?.code === '23505' || /duplicate key/i.test(err?.message || '')) {
    return res.status(409).json({ error: 'Já existe um registro com esses dados.' });
  }
  console.error('[erro]', err);
  res.status(500).json({ error: 'Erro interno no servidor.', details: err?.message });
}
