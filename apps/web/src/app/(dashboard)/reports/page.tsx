'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { DataState } from '@/components/common/data-state';
import { toast } from 'sonner';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Layers,
  Scale,
} from 'lucide-react';

export default function ReportsPage() {
  const { activeBranch } = useAuth();
  const [activeReport, setActiveReport] = useState<'reconciliation' | 'expiry' | 'valuation'>(
    'reconciliation',
  );

  const {
    data: recon,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reconciliation', activeBranch.id],
    queryFn: () => apiClient.getReconciliationReport(activeBranch.id),
  });

  const handleExportCsv = () => {
    if (!recon || !recon.items) return;

    const headers = [
      'Medicine Name',
      'SKU',
      'Opening Stock',
      'Purchases (+)',
      'Sales (-)',
      'Returns (+)',
      'Adjustments (+/-)',
      'Calculated Closing',
      'Actual Closing',
      'Variance',
      'Status',
    ];

    const rows = recon.items.map((item) => [
      `"${item.medicineName}"`,
      `"${item.sku}"`,
      item.openingStock,
      item.purchases,
      item.sales,
      item.returns,
      item.adjustments,
      item.calculatedClosing,
      item.actualClosing,
      item.variance,
      item.isReconciled ? 'RECONCILED' : 'DISCREPANCY',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `pharmacy_stock_reconciliation_${activeBranch.code}_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Stock reconciliation report exported to CSV!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Scale className="w-6 h-6 text-emerald-600" />
            Stock Ledger & Financial Reconciliation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Acceptance Test #5: Proof that calculated closing stock matches physical ledger balance
            with zero variance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-2 text-xs">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Selector Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveReport('reconciliation')}
          className={`text-xs px-3.5 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            activeReport === 'reconciliation'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Stock Reconciliation (Test #5)
        </button>
      </div>

      <DataState isLoading={isLoading} isError={isError} error={error as Error} onRetry={refetch}>
        {recon && (
          <div className="space-y-6">
            {/* Reconciliation Proof Banner */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                recon.allReconciled
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    recon.allReconciled
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {recon.allReconciled ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <AlertTriangle className="w-6 h-6" />
                  )}
                </div>

                <div>
                  <h2
                    className={`text-sm font-bold ${
                      recon.allReconciled
                        ? 'text-emerald-900 dark:text-emerald-200'
                        : 'text-red-900'
                    }`}
                  >
                    {recon.allReconciled
                      ? 'All Stock Fully Reconciled (0 Variance Across All Batches)'
                      : 'Stock Discrepancy Flagged in Ledger!'}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Formula: Opening Stock + Purchases − Sales + Returns ± Adjustments = Calculated
                    Closing.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <Badge variant={recon.allReconciled ? 'clinical' : 'destructive'}>
                  {recon.allReconciled ? 'RECONCILED ✔' : 'VARIANCE DETECTED'}
                </Badge>
              </div>
            </div>

            {/* Reconciliation Data Table */}
            <Card>
              <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
                <CardTitle className="text-base font-semibold">
                  Ledger Movement Proof by Formulation
                </CardTitle>
                <CardDescription>
                  Period: {recon.periodStart} to {recon.periodEnd} • Branch: {recon.branchName}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicine & SKU</TableHead>
                      <TableHead className="text-center">Opening Stock</TableHead>
                      <TableHead className="text-center text-emerald-700">+ Purchases</TableHead>
                      <TableHead className="text-center text-red-600">− Sales</TableHead>
                      <TableHead className="text-center">+ Returns</TableHead>
                      <TableHead className="text-center">± Adjustments</TableHead>
                      <TableHead className="text-center font-bold">= Calculated</TableHead>
                      <TableHead className="text-center font-bold">Actual Balance</TableHead>
                      <TableHead className="text-center">Variance</TableHead>
                      <TableHead className="text-center">Audit Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recon.items.map((item) => (
                      <TableRow key={item.medicineId}>
                        <TableCell>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.medicineName}
                          </div>
                          <div className="font-mono text-xs text-slate-400">{item.sku}</div>
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs">
                          {item.openingStock}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-emerald-600 font-semibold">
                          +{item.purchases}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs text-red-600 font-semibold">
                          {item.sales}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          +{item.returns}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {item.adjustments}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                          {item.calculatedClosing}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {item.actualClosing}
                        </TableCell>

                        <TableCell className="text-center font-mono text-xs font-bold">
                          {item.variance === 0 ? (
                            <span className="text-emerald-600">0</span>
                          ) : (
                            <span className="text-red-600">{item.variance}</span>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          <Badge
                            variant={item.isReconciled ? 'clinical' : 'destructive'}
                            className="text-[10px]"
                          >
                            {item.isReconciled ? 'Reconciled ✔' : 'Discrepancy'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </DataState>
    </div>
  );
}
