/**
 * Common type definitions
 */

// Generic utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

// Component prop patterns
export interface BaseComponentProps {
  className?: string;
}

export interface WithChildren {
  children: React.ReactNode;
}

// Async state pattern
export interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

// Form patterns
export interface FormFieldState {
  value: string;
  error?: string;
  touched: boolean;
}

// API response patterns
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Event handler patterns
export type VoidHandler = () => void;
export type ValueHandler<T> = (value: T) => void;
export type AsyncHandler<T = void> = () => Promise<T>;
