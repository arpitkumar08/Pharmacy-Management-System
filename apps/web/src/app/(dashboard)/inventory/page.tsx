'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { DataState } from '@/components/common/data-state';
import type { BatchSummary } from '@pharmacy/shared';
import {
  Boxes,
  Search,
  AlertTriangle,
  Clock,
  Ban,
  SlidersHorizontal,
  History,
  ShieldCheck,
} from 'lucide-react';

function InventoryContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get('filter') || 'all';
  const { activeBranch } = useAuth();

  const [activeTab, setActiveTab] = useState<'all' | 'low' | 'near-expiry' | 'expired'>(
    (initialFilter as 'all' | 'low' | 'near-expiry' | 'expired') || 'all',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchForLedger, setSelectedBatchForLedger] = useState<BatchSummary | null>(null);

  // Queries
  const {
    data: batches = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['batches', activeBranch.id],
    queryFn: () => apiClient.getBatches(),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ['movements', activeBranch.id],
    queryFn: () => apiClient.getStockMovements(),
  });

  // Filter logic
  const filteredBatches = batches.filter((b) => {
    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match =
        b.medicineName?.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.medicineSku?.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (activeTab === 'expired') return b.isExpired;
    if (activeTab === 'near-expiry') return b.isNearExpiry;
    if (activeTab === 'low') return b.isLowStock;
    return true;
  });

  // Ledger movements for selected batch
  const batchMovements = selectedBatchForLedger
    ? movements.filter((m) => m.batchId === selectedBatchForLedger.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-600" />
            Batch Inventory & Stock Ledger
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Batch-level tracking, expiry controls, and append-only stock movement audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/inventory/adjustments">
            <Button variant="default" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              New Stock Adjustment
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              <button
                onClick={() => setActiveTab('all')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'all'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                All Batches ({batches.length})
              </button>
              <button
                onClick={() => setActiveTab('near-expiry')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'near-expiry'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                <Clock className="w-3 h-3" />
                Near Expiry ({batches.filter((b) => b.isNearExpiry).length})
              </button>
              <button
                onClick={() => setActiveTab('expired')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'expired'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 hover:bg-red-100'
                }`}
              >
                <Ban className="w-3 h-3" />
                Expired ({batches.filter((b) => b.isExpired).length})
              </button>
              <button
                onClick={() => setActiveTab('low')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'low'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Low Stock ({new Set(batches.filter((b) => b.isLowStock).map((b) => b.medicineId)).size})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Search batch or medicine..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs"
              />
            </div>
          </div>

          {/* Batches Table */}
          <DataState
            isLoading={isLoading}
            isError={isError}
            error={error as Error}
            isEmpty={filteredBatches.length === 0}
            emptyTitle="No batches found"
            emptyDescription="No inventory batches match the selected filters."
            onRetry={refetch}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine & SKU</TableHead>
                  <TableHead>Batch Number</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead className="text-center">Quantity on Hand</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ledger History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {batch.medicineName}
                      </div>
                      <div className="font-mono text-xs text-slate-400">{batch.medicineSku}</div>
                    </TableCell>

                    <TableCell className="font-mono text-xs font-semibold">
                      {batch.batchNumber}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{formatDate(batch.expiryDate)}</span>
                        {batch.isExpired && (
                          <Badge variant="destructive" className="text-[10px] py-0">
                            <Ban className="w-2.5 h-2.5 mr-0.5" />
                            Expired
                          </Badge>
                        )}
                        {batch.isNearExpiry && (
                          <Badge variant="warning" className="text-[10px] py-0">
                            <Clock className="w-2.5 h-2.5 mr-0.5" />
                            Near Expiry
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <span
                        className={`font-bold text-sm ${
                          batch.qtyOnHand <= 20
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {batch.qtyOnHand}
                      </span>
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      {formatCurrency(batch.salePrice)}
                    </TableCell>

                    <TableCell className="text-center">
                      <Badge
                        variant={
                          batch.isExpired
                            ? 'destructive'
                            : batch.qtyOnHand === 0
                              ? 'secondary'
                              : 'clinical'
                        }
                      >
                        {batch.isExpired ? 'EXPIRED' : batch.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                        onClick={() => setSelectedBatchForLedger(batch)}
                      >
                        <History className="w-3.5 h-3.5" />
                        Ledger
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataState>
        </CardContent>
      </Card>

      {/* Batch Ledger Drawer / Modal (§9.1 & Acceptance Test #1 verification) */}
      <Dialog
        open={Boolean(selectedBatchForLedger)}
        onOpenChange={(open) => !open && setSelectedBatchForLedger(null)}
        title={`Stock Movements Ledger — Batch ${selectedBatchForLedger?.batchNumber}`}
        description={`Append-only transaction history for ${selectedBatchForLedger?.medicineName}. Current balance: ${selectedBatchForLedger?.qtyOnHand} units.`}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs flex justify-between">
            <span>
              Medicine: <strong>{selectedBatchForLedger?.medicineName}</strong>
            </span>
            <span>
              Expiry: <strong>{selectedBatchForLedger?.expiryDate}</strong>
            </span>
            <span>
              Current Balance: <strong>{selectedBatchForLedger?.qtyOnHand}</strong>
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {batchMovements.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No movements recorded yet for this batch.
              </p>
            ) : (
              batchMovements.map((mov) => (
                <div
                  key={mov.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {mov.type}
                      </Badge>
                      <span className="text-slate-500">Ref: {mov.refId || 'N/A'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {formatDate(mov.createdAt)} • by {mov.createdBy}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`font-mono font-bold text-sm ${
                        mov.qtyDelta > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {mov.qtyDelta > 0 ? `+${mov.qtyDelta}` : mov.qtyDelta}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Balance: <strong>{mov.balanceAfter}</strong>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">Loading batch inventory...</div>
      }
    >
      <InventoryContent />
    </Suspense>
  );
}
