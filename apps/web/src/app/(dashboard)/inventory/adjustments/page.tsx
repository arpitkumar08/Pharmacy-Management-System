'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AdjustmentReasonCode } from '@pharmacy/shared';
import { toast } from 'sonner';
import { SlidersHorizontal, AlertCircle, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function AdjustmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeBranch } = useAuth();

  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [qtyDelta, setQtyDelta] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode>(
    AdjustmentReasonCode.COUNT_CORRECTION,
  );
  const [reasonNote, setReasonNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: batches = [] } = useQuery({
    queryKey: ['batches', activeBranch.id],
    queryFn: () => apiClient.getBatches(),
  });

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);
  const projectedBalance = selectedBatch ? selectedBatch.qtyOnHand + Number(qtyDelta) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBatchId) {
      toast.error('Please select a batch to adjust.');
      return;
    }

    if (qtyDelta === 0) {
      toast.error('Quantity delta cannot be zero (must be + or -).');
      return;
    }

    if (reasonNote.trim().length < 5) {
      toast.error(
        'Reason note is mandatory and must be at least 5 characters (Acceptance Test #4).',
      );
      return;
    }

    if (projectedBalance < 0) {
      toast.error(
        `Adjustment would result in negative stock balance (${projectedBalance}). Operation aborted.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createAdjustment({
        batchId: selectedBatchId,
        qtyDelta: Number(qtyDelta),
        reasonCode,
        reasonNote: reasonNote.trim(),
      });

      toast.success('Stock adjustment recorded successfully in append-only ledger!');
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      // Reset form
      setQtyDelta(0);
      setReasonNote('');
      router.push('/inventory');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(`Adjustment failed: ${err.detail}`);
      } else {
        toast.error('Failed to record adjustment.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Top back navigation */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Inventory
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
            Stock Adjustment (Audit-Controlled)
          </CardTitle>
          <CardDescription>
            Direct adjustments modify current balance and record an immutable entry into the stock
            movements ledger. Per compliance rule, a specific reason code and detailed note are
            strictly mandatory.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Batch Selector */}
            <div>
              <Label required>Select Target Batch</Label>
              <Select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                required
              >
                <option value="">-- Choose a batch to adjust --</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.medicineName} — Batch: {b.batchNumber} (Current on hand: {b.qtyOnHand})
                  </option>
                ))}
              </Select>
            </div>

            {selectedBatch && (
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Stock:</span>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {selectedBatch.qtyOnHand} units
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expiry Date:</span>
                  <span>{selectedBatch.expiryDate}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Projected Balance After Adjustment:</span>
                  <strong
                    className={`font-mono ${
                      projectedBalance < 0
                        ? 'text-red-600'
                        : projectedBalance === 0
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                    }`}
                  >
                    {projectedBalance} units
                  </strong>
                </div>
              </div>
            )}

            {/* Quantity Delta Input */}
            <div>
              <Label required>Quantity Delta (+ to increase, - to decrease)</Label>
              <Input
                type="number"
                placeholder="e.g. -5 (spoilage/damage) or +10 (found stock)"
                value={qtyDelta || ''}
                onChange={(e) => setQtyDelta(parseInt(e.target.value, 10) || 0)}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Use positive numbers to add stock, negative numbers to write-off or record loss.
              </p>
            </div>

            {/* Reason Code Dropdown (§9.6 requirement) */}
            <div>
              <Label required>Reason Category</Label>
              <Select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}
                required
              >
                <option value={AdjustmentReasonCode.COUNT_CORRECTION}>
                  Physical Count Correction (Cycle Count)
                </option>
                <option value={AdjustmentReasonCode.DAMAGE}>Physical Damage / Broken Vials</option>
                <option value={AdjustmentReasonCode.EXPIRED_WRITE_OFF}>
                  Expired Batch Write-off
                </option>
                <option value={AdjustmentReasonCode.THEFT}>Pilferage / Unaccounted Loss</option>
                <option value={AdjustmentReasonCode.OTHER}>Other Operational Reason</option>
              </Select>
            </div>

            {/* Mandatory Reason Note (§9.6 / Acceptance Test #4: Reason required >= 5 chars) */}
            <div>
              <Label required>Auditable Reason Note (Min. 5 characters)</Label>
              <textarea
                rows={3}
                required
                minLength={5}
                placeholder="Provide specific justification for audit trail (e.g., 'Discovered 2 damaged strips during morning shelf audit')..."
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-2.5 text-sm text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                {reasonNote.length}/5 minimum characters
              </p>
            </div>

            {projectedBalance < 0 && (
              <div className="p-3 rounded-lg bg-red-50 text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Cannot proceed: Stock cannot drop below zero in database.</span>
              </div>
            )}

            <Button
              type="submit"
              variant="default"
              disabled={isSubmitting || projectedBalance < 0 || !selectedBatchId || qtyDelta === 0}
              isLoading={isSubmitting}
              className="w-full h-11 text-base font-semibold"
            >
              Confirm and Record Adjustment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
