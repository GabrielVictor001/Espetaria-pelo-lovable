import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { forbidden, unauthorized } from './http';

export interface AuthUser {
  id: number;
  name: string;
  username: string | null;
  role: 'admin' | 'waiter';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, name: user.name, username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpires as any,
  });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req as any).cookies?.pdv_token;
  if (typeof cookie === 'string' && cookie) return cookie;
  return null;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    req.user = {
      id: Number(payload.sub),
      name: payload.name,
      username: payload.username ?? null,
      role: payload.role === 'admin' ? 'admin' : 'waiter',
    };
    next();
  } catch {
    next(unauthorized());
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden());
  next();
}
