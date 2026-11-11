'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';
import { Button } from '../ui/button';

interface DataStateProps {
  isLoading?: boolean;
  isError?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRetry?: () => void;
  skeletonCount?: number;
  skeletonHeight?: string;
  children: React.ReactNode;
}

export function DataState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyTitle = 'No records found',
  emptyDescription = 'There is currently no data matching your criteria.',
  emptyAction,
  onRetry,
  skeletonCount = 3,
  skeletonHeight = 'h-14',
  children,
}: DataStateProps) {
  // 1. Loading State (Skeleton)
  if (isLoading) {
    return (
      <div className="w-full space-y-3 animate-pulse" role="status" aria-label="Loading content">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className={`w-full bg-slate-200 dark:bg-slate-800 rounded-lg ${skeletonHeight}`}
          />
        ))}
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  // 2. Error State (with retry option)
  if (isError) {
    return (
      <div
        role="alert"
        className="w-full p-8 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded-xl flex flex-col items-center justify-center text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-base font-semibold text-red-900 dark:text-red-200">
            Failed to load data
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1 max-w-md">
            {error?.message || 'An unexpected error occurred while communicating with the service.'}
          </p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-2 border-red-300 dark:border-red-800 hover:bg-red-100"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // 3. Empty State
  if (isEmpty) {
    return (
      <div className="w-full py-12 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-3 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
          <Inbox className="w-6 h-6" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{emptyTitle}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            {emptyDescription}
          </p>
        </div>
        {emptyAction && <div className="mt-2">{emptyAction}</div>}
      </div>
    );
  }

  // 4. Success / Content State
  return <>{children}</>;
}
