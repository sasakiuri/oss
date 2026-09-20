import type { NewsListResponse, NewsGetResponse, ContactFormData, ContactResponse } from '@/lib/schemas';

/**
 * News Repository Interface
 * Abstraction layer for news data access
 */
export interface NewsRepository {
  findAll(): Promise<NewsListResponse>;
  findById(id: string): Promise<NewsGetResponse>;
}

/**
 * Contact Service Interface
 * Abstraction layer for contact message sending
 */
export interface ContactService {
  send(data: ContactFormData): Promise<ContactResponse>;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Helper to create success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Helper to create error result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}
