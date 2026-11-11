'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { APP_CONSTANTS } from '@pharmacy/shared';

export function DisclaimerBanner() {
  return (
    <div
      role="banner"
      className="disclaimer-banner w-full bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-center gap-2 select-none"
    >
      <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <span className="font-medium">{APP_CONSTANTS.DEMO_DISCLAIMER}</span>
      <span className="text-amber-700/80 dark:text-amber-400/80 hidden sm:inline">
        — Multi-Branch Tenancy & FEFO Batch Engine Prototype
      </span>
    </div>
  );
}
