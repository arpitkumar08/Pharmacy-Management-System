'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataState } from '@/components/common/data-state';
import { toast } from 'sonner';
import { Truck, PackagePlus, CheckCircle, Clock } from 'lucide-react';

export default function PurchasingPage() {
  const { activeBranch } = useAuth();
  const queryClient = useQueryClient();
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);

  // Goods receipt form state
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [receivedQty, setReceivedQty] = useState<number>(50);
  const [purchasePrice, setPurchasePrice] = useState<number>(25.0);
  const [salePrice, setSalePrice] = useState<number>(50.0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: medicines = [] } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => apiClient.getMedicines(),
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => apiClient.getSuppliers() });
  const { data: purchaseOrders = [], isLoading, isError, refetch } = useQuery({ queryKey: ['purchase-orders'], queryFn: () => apiClient.getPurchaseOrders() });

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMedicineId || !batchNumber.trim() || !expiryDate) {
      toast.error('Please complete all required fields.');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (expiryDate <= today) {
      toast.error('Expiry date must be in the future (cannot receive already expired batches).');
      return;
    }

    if (!selectedSupplierId) { toast.error('Choose a supplier before receiving stock.'); return; }
    setIsSubmitting(true);
    try {
      await apiClient.createGoodsReceipt({ branchId: activeBranch.id, supplierId: selectedSupplierId, medicineId: selectedMedicineId, batchNumber: batchNumber.trim(), expiryDate, qty: receivedQty, purchasePrice, salePrice });
      toast.success(`Batch ${batchNumber} received and purchase ledger recorded.`);
      setIsReceiveModalOpen(false); setBatchNumber(''); setExpiryDate(''); setSelectedMedicineId('');
      for (const key of ['purchase-orders', 'batches', 'movements', 'dashboard-stats', 'medicines', 'audit-logs']) await queryClient.invalidateQueries({ queryKey: [key] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Goods receipt failed.');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            Purchasing & Goods Receipt
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supplier purchase orders, goods receipt verification, and incoming batch creation.
          </p>
        </div>

        <Button onClick={() => setIsReceiveModalOpen(true)} className="gap-2">
          <PackagePlus className="w-4 h-4" />
          Receive Goods into Batches
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Active Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <DataState isLoading>{null}</DataState> : isError ? <DataState isError error={new Error('Unable to load purchase orders.')} onRetry={() => void refetch()}>{null}</DataState> : purchaseOrders.length === 0 ? <DataState isEmpty emptyTitle="No purchase orders yet" emptyDescription="Receive stock to create your first order and batch ledger entry.">{null}</DataState> : <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Date Created</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-center">Line Items</TableHead>
                <TableHead className="text-right">Order Value</TableHead>
                <TableHead className="text-center">Lifecycle Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono font-bold text-xs">{po.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {formatDate(po.createdAt)}
                  </TableCell>
                  <TableCell className="text-xs font-medium">{po.supplierName}</TableCell>
                  <TableCell className="text-center text-xs">{po.items?.length || 0}</TableCell>
                  <TableCell className="text-right font-bold text-sm">
                    {formatCurrency(po.totalAmount)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        po.status === 'RECEIVED'
                          ? 'clinical'
                          : po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {po.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-xs text-slate-400">{po.status}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
        </CardContent>
      </Card>

      {/* Goods Receipt Modal (§9.5: validation that expiry is in future, creation of batch) */}
      <Dialog
        open={isReceiveModalOpen}
        onOpenChange={setIsReceiveModalOpen}
        title="Receive Goods into Batches (Goods Receipt)"
        description="Verify incoming shipment from supplier. Every received item creates a unique batch and logs a PURCHASE_RECEIPT movement."
      >
        <form onSubmit={handleReceiveStock} className="space-y-4">
          <div>
            <Label required>Supplier</Label>
            <Select value={selectedSupplierId} onChange={(e) => setSelectedSupplierId(e.target.value)} required>
              <option value="">-- Choose supplier --</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Medicine to Receive</Label>
            <Select
              value={selectedMedicineId}
              onChange={(e) => setSelectedMedicineId(e.target.value)}
              required
            >
              <option value="">-- Choose medicine formulation --</option>
              {medicines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.sku})
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Batch Number (Manufacturer)</Label>
              <Input
                placeholder="e.g. ZT-2027-C3"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <Label required>Expiry Date (Future)</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label required>Received Units</Label>
              <Input
                type="number"
                min={1}
                value={receivedQty}
                onChange={(e) => setReceivedQty(parseInt(e.target.value, 10) || 1)}
                required
              />
            </div>
            <div>
              <Label required>Purchase Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div>
              <Label required>Selling Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="default"
            className="w-full"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Confirm Goods Receipt & Create Batch
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
