'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataState } from '@/components/common/data-state';
import { Printer, ArrowLeft, Activity, CheckCircle, FileText } from 'lucide-react';
import { APP_CONSTANTS } from '@pharmacy/shared';

export default function InvoicePage() {
  const params = useParams();
  const router = useRouter();
  const saleId = params.id as string;

  const {
    data: sale,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['sale-invoice', saleId],
    queryFn: () => apiClient.getSale(saleId),
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top action buttons (hidden when printing) */}
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="default" onClick={handlePrint} className="gap-2 shadow-sm">
            <Printer className="w-4 h-4" />
            Print Tax Invoice
          </Button>
        </div>
      </div>

      <DataState isLoading={isLoading} isError={isError} error={error as Error}>
        {sale && (
          <div className="printable-area bg-white text-slate-900 border border-slate-200 rounded-xl p-8 shadow-sm space-y-6">
            {/* Header / Pharmacy Info */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    PharmaCore Health Systems
                  </h1>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {sale.branchName || 'Central Branch'}
                </p>
                <p className="text-xs text-slate-500">
                  Licensed Pharmacy Dispenser • GSTIN: 27AABCP1234F1Z5
                </p>
              </div>

              <div className="text-right space-y-1">
                <Badge variant="clinical" className="text-xs font-mono">
                  TAX INVOICE
                </Badge>
                <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                  {sale.invoiceNumber}
                </div>
                <div className="text-xs text-slate-500">Date: {formatDateTime(sale.createdAt)}</div>
              </div>
            </div>

            {/* Billed To / Metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-200 pb-4">
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider block">
                  Patient / Customer
                </span>
                <p className="font-bold text-slate-900 mt-0.5">
                  {sale.customerName || 'Walk-in Counter Patient'}
                </p>
                {sale.customerPhone && (
                  <p className="text-slate-600">Phone: {sale.customerPhone}</p>
                )}
              </div>

              <div className="text-right">
                <span className="font-semibold text-slate-500 uppercase tracking-wider block">
                  Transaction Details
                </span>
                <p className="text-slate-700">
                  Cashier: <strong>{sale.cashierName}</strong>
                </p>
                <p className="text-slate-700">
                  Payment: <strong>{sale.paymentMethod}</strong>
                </p>
                <p className="font-mono text-[11px] text-slate-400">ID: {sale.id.slice(0, 8)}</p>
              </div>
            </div>

            {/* Itemized Line Items Table with Batch & Expiry snapshot (§9.8 requirement) */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left font-semibold uppercase tracking-wider">
                    <th className="py-2.5">Item Description</th>
                    <th className="py-2.5">Batch / Expiry (FEFO)</th>
                    <th className="py-2.5 text-center">Qty</th>
                    <th className="py-2.5 text-right">Unit Price</th>
                    <th className="py-2.5 text-right">Tax (%)</th>
                    <th className="py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {sale.items?.map((item) => (
                    <tr key={item.id} className="py-2">
                      <td className="py-3">
                        <span className="font-semibold text-slate-900 block">
                          {item.medicineName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.medicineSku}
                        </span>
                      </td>

                      <td className="py-3 font-mono text-[11px]">
                        {item.allocations && item.allocations.length > 0 ? (
                          item.allocations.map((alloc) => (
                            <div key={alloc.id} className="text-slate-600">
                              Batch: <strong>{alloc.batchNumber || 'B-Default'}</strong> (Exp:{' '}
                              {alloc.expiryDate || 'N/A'}) × {alloc.qty}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400">Allocated</span>
                        )}
                      </td>

                      <td className="py-3 text-center font-bold">{item.qty}</td>
                      <td className="py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="py-3 text-right font-medium">
                        {item.taxRate}% ({formatCurrency(item.taxAmount)})
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900">
                        {formatCurrency(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
              <div className="w-64 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(sale.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax Amount:</span>
                  <span>{formatCurrency(sale.taxTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-300">
                  <span>Grand Total:</span>
                  <span className="text-emerald-700">{formatCurrency(sale.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Mandatory Regulatory & Demo Disclaimers (§9.8 & Acceptance Rules) */}
            <div className="pt-6 border-t border-dashed border-slate-200 text-center space-y-1">
              <p className="text-xs font-semibold text-slate-700">
                Thank you for your visit. Please take medications only as directed by your
                physician.
              </p>
              <p className="text-[11px] text-amber-800 font-medium">
                {APP_CONSTANTS.DEMO_DISCLAIMER}
              </p>
              <p className="text-[10px] text-slate-400">
                Computer-generated invoice. No physical signature required.
              </p>
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}
