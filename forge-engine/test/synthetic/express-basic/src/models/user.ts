export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  name: string;
}

export interface UpdateUserDTO {
  email?: string;
  name?: string;
}

export type UserRole = 'admin' | 'user' | 'guest';

export interface UserWithRole extends User {
  role: UserRole;
}
