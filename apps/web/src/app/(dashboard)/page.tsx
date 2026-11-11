'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/common/data-state';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Pill,
  ShoppingCart,
  SlidersHorizontal,
  Boxes,
  ArrowRight,
  ShieldAlert,
  FileCheck2,
} from 'lucide-react';

export default function DashboardPage() {
  const { activeBranch } = useAuth();

  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-stats', activeBranch.id],
    queryFn: () => apiClient.getDashboardStats(),
  });

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Pharmacy Operations Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time branch inventory, FEFO batch allocations, and stock health monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/pos">
            <Button variant="default" className="gap-2 shadow-sm">
              <ShoppingCart className="w-4 h-4" />
              New Sale / POS
            </Button>
          </Link>
          <Link href="/inventory/adjustments">
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Stock Adjustment
            </Button>
          </Link>
        </div>
      </div>

      <DataState isLoading={isLoading} isError={isError} error={error as Error} onRetry={refetch}>
        {stats && (
          <>
            {/* Critical Alert Banners (if any expired batches exist) */}
            {stats.expiredBatchesCount > 0 && (
              <div
                role="alert"
                className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-red-900 dark:text-red-200">
                      {stats.expiredBatchesCount} Expired Batch Detected in Stock
                    </h2>
                    <p className="text-xs text-red-700 dark:text-red-300">
                      Expired stock is automatically blocked from sales via FEFO engine constraints.
                      Quarantine or write off immediately.
                    </p>
                  </div>
                </div>
                <Link href="/inventory?filter=expired">
                  <Button variant="destructive" size="sm" className="whitespace-nowrap">
                    View Expired Stock
                  </Button>
                </Link>
              </div>
            )}

            {/* KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">
                    Today's Revenue
                  </CardTitle>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(stats.todaySalesAmount)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {stats.todaySalesCount} completed invoices
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">
                    Low Stock Alerts
                  </CardTitle>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {stats.lowStockItemsCount}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Below configured reorder level</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">
                    Near Expiry Batches
                  </CardTitle>
                  <Clock className="w-4 h-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {stats.nearExpiryBatchesCount}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Expiring within 90 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500">
                    Active Catalog
                  </CardTitle>
                  <Pill className="w-4 h-4 text-slate-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats.totalActiveMedicines}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Configured medicine formulations</p>
                </CardContent>
              </Card>
            </div>

            {/* Split Grid: Near Expiry Alerts & Low Stock Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Near Expiry Batches Alert Box */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Near Expiry Batches (FEFO Priority)
                    </CardTitle>
                    <CardDescription>
                      Batches nearing expiry prioritized for sale before expiration.
                    </CardDescription>
                  </div>
                  <Link href="/inventory?filter=near-expiry">
                    <Button variant="ghost" size="sm" className="text-xs">
                      All <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {stats.alerts.nearExpiry.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No batches near expiry 🎉
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.alerts.nearExpiry.map((item) => (
                        <div
                          key={item.batchId}
                          className="flex items-center justify-between p-3 rounded-lg border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20"
                        >
                          <div>
                            <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                              {item.medicineName}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Batch: <span className="font-mono">{item.batchNumber}</span> • Exp:{' '}
                              {item.expiryDate}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="warning" className="text-xs">
                              {item.daysRemaining} days left
                            </Badge>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              Stock: <strong>{item.qtyOnHand}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Low Stock Alerts */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Low Stock Threshold Alerts
                    </CardTitle>
                    <CardDescription>
                      Medicines where total stock is at or below the reorder level.
                    </CardDescription>
                  </div>
                  <Link href="/inventory?filter=low">
                    <Button variant="ghost" size="sm" className="text-xs">
                      All <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {stats.alerts.lowStock.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      All stock levels adequate
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.alerts.lowStock.map((item) => (
                        <div
                          key={item.medicineId}
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                        >
                          <div>
                            <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                              {item.medicineName}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 font-mono">
                              {item.sku}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                              {item.currentStock} in stock
                            </span>
                            <div className="text-xs text-slate-400">
                              Reorder at: {item.reorderLevel}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Sales Ledger Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Sales Activity</CardTitle>
                  <CardDescription>
                    Itemized sales transactions and printable invoice access.
                  </CardDescription>
                </div>
                <Link href="/sales">
                  <Button variant="outline" size="sm">
                    View Sales History
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {sale.invoiceNumber}
                          </span>
                          <Badge variant="clinical">{sale.status}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Cashier: {sale.cashierName} • {formatDate(sale.createdAt)} •{' '}
                          {sale.items?.length || 1} line item(s)
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(sale.grandTotal)}
                        </span>
                        <Link href={`/sales/${sale.id}/invoice`}>
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            Invoice
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </DataState>
    </div>
  );
}
