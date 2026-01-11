/**
 * API Service - depends on http utilities
 * Dependency: api → http → helpers
 */
import { HttpClient, HttpResponse } from '../utils/http';
import { AuthService } from './auth';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
}

export class ApiService {
  private http: HttpClient;
  private auth: AuthService;

  constructor(http: HttpClient, auth: AuthService) {
    this.http = http;
    this.auth = auth;
  }

  async getUsers(): Promise<User[]> {
    this.ensureAuthenticated();
    const response: HttpResponse<User[]> = await this.http.get('/users');
    return response.data;
  }

  async getUser(id: string): Promise<User> {
    this.ensureAuthenticated();
    const response: HttpResponse<User> = await this.http.get(`/users/${id}`);
    return response.data;
  }

  async getPosts(userId?: string): Promise<Post[]> {
    this.ensureAuthenticated();
    const params = userId ? { userId } : undefined;
    const response: HttpResponse<Post[]> = await this.http.get('/posts', params);
    return response.data;
  }

  async createPost(post: Omit<Post, 'id'>): Promise<Post> {
    this.ensureAuthenticated();
    const response: HttpResponse<Post> = await this.http.post('/posts', post);
    return response.data;
  }

  private ensureAuthenticated(): void {
    const token = this.auth.getToken();
    if (token) {
      this.http.setAuthHeader(token);
    }
  }
}
