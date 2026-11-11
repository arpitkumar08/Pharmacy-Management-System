import type { Metadata } from 'next';
import './globals.css';
import { ClientProviders } from './providers';
import { DisclaimerBanner } from '@/components/layout/disclaimer-banner';

export const metadata: Metadata = {
  title: 'Pharmacy Management System — Multi-Branch FEFO Inventory',
  description:
    'Full-Stack Pharmacy Management System demonstrating strict FEFO allocation, multi-branch tenancy, append-only stock movement ledger, audit trails, and reconciliation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
        <ClientProviders>
          <DisclaimerBanner />
          <div className="flex-1 flex flex-col">{children}</div>
        </ClientProviders>
      </body>
    </html>
  );
}
