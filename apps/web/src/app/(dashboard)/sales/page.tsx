'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DataState } from '@/components/common/data-state';
import { ReturnReasonCode, ReturnDisposition } from '@pharmacy/shared';
import type { SaleSummary } from '@pharmacy/shared';
import { toast } from 'sonner';
import { Receipt, FileText, RotateCcw, Search, ShoppingCart } from 'lucide-react';

export default function SalesHistoryPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<SaleSummary | null>(null);

  // Return dialog state
  const [returnQty, setReturnQty] = useState(1);
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>(
    ReturnReasonCode.PATIENT_CANCELLED,
  );
  const [disposition, setDisposition] = useState<ReturnDisposition>(ReturnDisposition.RESTOCK);
  const [reasonNote, setReasonNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query sales
  const {
    data: sales = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sales'],
    queryFn: () => apiClient.getSales(),
  });

  const filteredSales = sales.filter((s) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      s.invoiceNumber.toLowerCase().includes(q) ||
      (s.customerName && s.customerName.toLowerCase().includes(q)) ||
      s.cashierName?.toLowerCase().includes(q)
    );
  });

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForReturn) return;

    if (reasonNote.trim().length < 5) {
      toast.error('Return reason note must be at least 5 characters (mandatory rule).');
      return;
    }

    const firstItem = selectedSaleForReturn.items?.[0];
    const firstAlloc = firstItem?.allocations?.[0];

    setIsSubmitting(true);
    try {
      await apiClient.createReturn({
        saleId: selectedSaleForReturn.id,
        reasonCode,
        reasonNote: reasonNote.trim(),
        items: [
          {
            allocationId: firstAlloc?.id || 'alloc-1',
            qty: returnQty,
            disposition,
          },
        ],
      });

      toast.success(`Sale return processed successfully! Stock disposition set to: ${disposition}`);
      setSelectedSaleForReturn(null);
      setReasonNote('');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    } catch {
      toast.error('Failed to process return.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Sales Transactions & Returns
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Historical sales receipts, invoice printing, and allocation-tracked returns.
          </p>
        </div>

        <Link href="/pos">
          <Button variant="default" className="gap-2">
            <ShoppingCart className="w-4 h-4" />
            New POS Sale
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Search bar */}
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Search invoice number, cashier, customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <DataState
            isLoading={isLoading}
            isError={isError}
            error={error as Error}
            isEmpty={filteredSales.length === 0}
            emptyTitle="No sales found"
            emptyDescription="No sales transactions matched your criteria."
            onRetry={refetch}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-center">Payment</TableHead>
                  <TableHead className="text-right">Grand Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                      {sale.invoiceNumber}
                    </TableCell>

                    <TableCell className="text-xs text-slate-500">
                      {formatDateTime(sale.createdAt)}
                    </TableCell>

                    <TableCell className="text-xs">
                      {sale.customerName || 'Walk-in Patient'}
                    </TableCell>

                    <TableCell className="text-xs text-slate-600">{sale.cashierName}</TableCell>

                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-[10px]">
                        {sale.paymentMethod}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right font-bold text-sm text-slate-900 dark:text-slate-100">
                      {formatCurrency(sale.grandTotal)}
                    </TableCell>

                    <TableCell className="text-center">
                      <Badge variant="clinical">{sale.status}</Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/sales/${sale.id}/invoice`}>
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                            <FileText className="w-3.5 h-3.5" />
                            Invoice
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-amber-700 dark:text-amber-400"
                          onClick={() => {
                            setSelectedSaleForReturn(sale);
                            setReturnQty(1);
                          }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Return
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataState>
        </CardContent>
      </Card>

      {/* Return Dialog Modal (§9.6: Mandatory reason code, note, and disposition) */}
      <Dialog
        open={Boolean(selectedSaleForReturn)}
        onOpenChange={(open) => !open && setSelectedSaleForReturn(null)}
        title={`Process Sale Return — Invoice ${selectedSaleForReturn?.invoiceNumber}`}
        description="Returns must link to the original FEFO batch allocations. Restocking or quarantine disposition and a mandatory reason are required."
      >
        <form onSubmit={handleProcessReturn} className="space-y-4">
          <div>
            <Label required>Quantity to Return</Label>
            <Input
              type="number"
              min={1}
              max={selectedSaleForReturn?.items?.[0]?.qty || 1}
              value={returnQty}
              onChange={(e) => setReturnQty(parseInt(e.target.value, 10) || 1)}
              required
            />
          </div>

          <div>
            <Label required>Return Reason Code</Label>
            <Select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReturnReasonCode)}
              required
            >
              <option value={ReturnReasonCode.PATIENT_CANCELLED}>
                Patient Cancelled / Changed Mind
              </option>
              <option value={ReturnReasonCode.DEFECTIVE}>
                Packaging Defect / Compromised Seal
              </option>
              <option value={ReturnReasonCode.WRONG_ITEM}>Wrong Item Dispensed</option>
              <option value={ReturnReasonCode.EXPIRED}>Near Expiry / Expired at Dispense</option>
              <option value={ReturnReasonCode.OTHER}>Other Clinical Reason</option>
            </Select>
          </div>

          <div>
            <Label required>Stock Disposition</Label>
            <Select
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as ReturnDisposition)}
              required
            >
              <option value={ReturnDisposition.RESTOCK}>
                RESTOCK (Restore quantity back to originating batch)
              </option>
              <option value={ReturnDisposition.QUARANTINE}>
                QUARANTINE (Hold for inspection, not sellable)
              </option>
              <option value={ReturnDisposition.WRITE_OFF}>
                WRITE OFF (Damaged/unusable, discard without restock)
              </option>
            </Select>
          </div>

          <div>
            <Label required>Return Reason Note (Min. 5 characters)</Label>
            <textarea
              rows={3}
              required
              minLength={5}
              placeholder="Explain return reason for the audit log..."
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-2.5 text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            />
          </div>

          <Button
            type="submit"
            variant="clinical"
            className="w-full"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Confirm Return & Record Stock Movement
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
