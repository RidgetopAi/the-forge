import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: 'admin' | 'user' | 'guest';
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'No authorization header' });
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Invalid authorization format' });
    return;
  }

  const token = authHeader.slice(7);

  // Stub: In real app, validate JWT here
  if (token === 'invalid') {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }

  // Stub: Extract user info from token
  req.userId = 'user-123';
  req.userRole = 'user';

  next();
}

export function requireRole(role: 'admin' | 'user') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.userRole !== role && req.userRole !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
