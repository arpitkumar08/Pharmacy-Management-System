import { ErrorCode } from '../constants';

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorResponse {
  type?: string;
  title: string;
  status: number;
  code: ErrorCode | string;
  detail: string;
  errors?: ApiFieldError[];
  requestId?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset?: number;
    cursor?: string;
    nextCursor?: string | null;
    hasMore: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}
