import { Router, Request, Response } from 'express';
import { User, CreateUserDTO, UpdateUserDTO } from '../models/user';

const router = Router();

// In-memory store for demo
const users: Map<string, User> = new Map();

// GET /api/users
router.get('/', (req: Request, res: Response) => {
  const allUsers = Array.from(users.values());
  res.json(allUsers);
});

// GET /api/users/:id
router.get('/:id', (req: Request, res: Response) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// POST /api/users
router.post('/', (req: Request<{}, {}, CreateUserDTO>, res: Response) => {
  const { email, name } = req.body;
  const id = crypto.randomUUID();
  const user: User = {
    id,
    email,
    name,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  users.set(id, user);
  res.status(201).json(user);
});

// PUT /api/users/:id
router.put('/:id', (req: Request<{ id: string }, {}, UpdateUserDTO>, res: Response) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const updated: User = {
    ...user,
    ...req.body,
    updatedAt: new Date()
  };
  users.set(req.params.id, updated);
  res.json(updated);
});

// DELETE /api/users/:id
router.delete('/:id', (req: Request, res: Response) => {
  if (!users.has(req.params.id)) {
    return res.status(404).json({ error: 'User not found' });
  }
  users.delete(req.params.id);
  res.status(204).send();
});

export { router as userRouter };
