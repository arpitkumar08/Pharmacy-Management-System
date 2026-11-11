'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, generateUUID } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PaymentMethod, BatchStatus } from '@pharmacy/shared';
import type { MedicineSummary, BatchSummary } from '@pharmacy/shared';
import { toast } from 'sonner';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  Ban,
  Clock,
  CheckCircle2,
  CreditCard,
  User,
  Phone,
  ShieldCheck,
} from 'lucide-react';

interface CartItem {
  medicine: MedicineSummary;
  qty: number;
  unitPrice: number;
  candidateBatches: BatchSummary[];
  fefoBatchesToUse: Array<{ batch: BatchSummary; take: number }>;
  hasExpiredStock: boolean;
  hasNearExpiryStock: boolean;
}

export default function PosPage() {
  const router = useRouter();
  const { activeBranch } = useAuth();
  const queryClient = useQueryClient();

  // Search & Cart state
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Per-checkout idempotency key (generated when cart is opened/initiated)
  const [idempotencyKey] = useState<string>(() => generateUUID());

  // Queries for medicines and active batches
  const { data: medicines = [] } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => apiClient.getMedicines(),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['batches', activeBranch.id],
    queryFn: () => apiClient.getBatches(),
  });

  // Filter medicines by search query
  const filteredMedicines = useMemo(() => {
    if (!searchQuery.trim()) return medicines;
    const q = searchQuery.toLowerCase();
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        (m.genericName && m.genericName.toLowerCase().includes(q)),
    );
  }, [medicines, searchQuery]);

  // Compute FEFO allocation preview for a medicine given requested quantity
  const computeFefoPreview = (medicineId: string, requestedQty: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const medBatches = batches.filter(
      (b) => b.medicineId === medicineId && b.branchId === activeBranch.id,
    );

    const expiredBatches = medBatches.filter((b) => b.expiryDate < today && b.qtyOnHand > 0);
    const activeValidBatches = medBatches
      .filter((b) => b.status === BatchStatus.ACTIVE && b.qtyOnHand > 0 && b.expiryDate >= today)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)); // FEFO: Earliest expiry first

    let remaining = requestedQty;
    const fefoBatchesToUse: Array<{ batch: BatchSummary; take: number }> = [];

    for (const b of activeValidBatches) {
      if (remaining <= 0) break;
      const take = Math.min(b.qtyOnHand, remaining);
      fefoBatchesToUse.push({ batch: b, take });
      remaining -= take;
    }

    const hasNearExpiryStock = fefoBatchesToUse.some((item) => item.batch.isNearExpiry);

    return {
      candidateBatches: activeValidBatches,
      fefoBatchesToUse,
      hasExpiredStock: expiredBatches.length > 0,
      hasNearExpiryStock,
      totalSellableStock: activeValidBatches.reduce((acc, b) => acc + b.qtyOnHand, 0),
      expiredStockCount: expiredBatches.reduce((acc, b) => acc + b.qtyOnHand, 0),
      defaultPrice: activeValidBatches[0]?.salePrice || 50,
    };
  };

  const addToCart = (med: MedicineSummary) => {
    const fefo = computeFefoPreview(med.id, 1);

    // Acceptance Test #2: An expired batch cannot be sold!
    if (fefo.totalSellableStock === 0) {
      if (fefo.expiredStockCount > 0) {
        toast.error(`Cannot add '${med.name}' — all available batches are expired! (Test Case #2)`);
      } else {
        toast.error(`'${med.name}' is out of stock!`);
      }
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.medicine.id === med.id);
      if (existing) {
        const newQty = existing.qty + 1;
        if (newQty > fefo.totalSellableStock) {
          toast.warning(`Cannot exceed total sellable stock (${fefo.totalSellableStock} units).`);
          return prev;
        }
        const updatedFefo = computeFefoPreview(med.id, newQty);
        return prev.map((item) =>
          item.medicine.id === med.id
            ? {
                ...item,
                qty: newQty,
                fefoBatchesToUse: updatedFefo.fefoBatchesToUse,
                hasNearExpiryStock: updatedFefo.hasNearExpiryStock,
              }
            : item,
        );
      }

      return [
        ...prev,
        {
          medicine: med,
          qty: 1,
          unitPrice: fefo.defaultPrice,
          candidateBatches: fefo.candidateBatches,
          fefoBatchesToUse: fefo.fefoBatchesToUse,
          hasExpiredStock: fefo.hasExpiredStock,
          hasNearExpiryStock: fefo.hasNearExpiryStock,
        },
      ];
    });
  };

  const updateQuantity = (medicineId: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((item) => {
            if (item.medicine.id !== medicineId) return item;
            const newQty = item.qty + delta;
            if (newQty <= 0) return null;

            const totalSellable = item.candidateBatches.reduce((acc, b) => acc + b.qtyOnHand, 0);
            if (newQty > totalSellable) {
              toast.warning(`Cannot exceed available sellable quantity (${totalSellable}).`);
              return item;
            }

            const updatedFefo = computeFefoPreview(medicineId, newQty);
            return {
              ...item,
              qty: newQty,
              fefoBatchesToUse: updatedFefo.fefoBatchesToUse,
              hasNearExpiryStock: updatedFefo.hasNearExpiryStock,
            };
          })
          .filter(Boolean) as CartItem[],
    );
  };

  const removeFromCart = (medicineId: string) => {
    setCart((prev) => prev.filter((item) => item.medicine.id !== medicineId));
  };

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.qty * item.unitPrice, 0);
  }, [cart]);

  const taxTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const lineSub = item.qty * item.unitPrice;
      return acc + (lineSub * item.medicine.taxRate) / 100;
    }, 0);
  }, [cart]);

  const grandTotal = subtotal + taxTotal;

  // Checkout submission
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    setIsSubmitting(true);
    try {
      const sale = await apiClient.createSale({
        branchId: activeBranch.id,
        customerId: null,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        idempotencyKey,
        items: cart.map((i) => ({
          medicineId: i.medicine.id,
          qty: i.qty,
        })),
      });

      toast.success(`Sale completed! Invoice ${sale.invoiceNumber} generated.`);
      await Promise.all(['sales', 'batches', 'movements', 'dashboard-stats'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      router.push(`/sales/${sale.id}/invoice`);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(`Checkout failed: ${err.detail}`);
      } else {
        toast.error('An unexpected error occurred during checkout.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            Point of Sale (POS) — FEFO Engine
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Batches are automatically allocated by Earliest Expiry (FEFO). Expired batches cannot be
            sold.
          </p>
        </div>

        <div className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Idempotency: {idempotencyKey.slice(0, 13)}...
        </div>
      </div>

      {/* Main Split Grid: Medicine Catalog Search vs Active Checkout Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Product Selector (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  placeholder="Search medicines by brand name, SKU, or generic composition..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10"
                  aria-label="Search medicine catalog"
                />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[580px] overflow-y-auto">
                {filteredMedicines.map((med) => {
                  const fefo = computeFefoPreview(med.id, 1);
                  const isDepleted = fefo.totalSellableStock === 0;
                  const isOnlyExpired = isDepleted && fefo.expiredStockCount > 0;

                  return (
                    <div
                      key={med.id}
                      className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-lg transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {med.name}
                          </span>
                          {med.requiresPrescription && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 text-red-600 border-red-200"
                            >
                              Rx Required
                            </Badge>
                          )}
                          {isOnlyExpired && (
                            <Badge variant="destructive" className="text-[10px] py-0">
                              <Ban className="w-2.5 h-2.5 mr-0.5" />
                              Expired Stock Only
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {med.genericName} • {med.unit} • Tax: {med.taxRate}%
                        </p>

                        {/* Stock and FEFO availability indicator */}
                        <div className="text-xs flex items-center gap-2 pt-0.5">
                          {isDepleted ? (
                            <span className="text-red-500 font-medium">Out of Sellable Stock</span>
                          ) : (
                            <>
                              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                {fefo.totalSellableStock} available
                              </span>
                              {fefo.candidateBatches[0] && (
                                <span className="text-slate-400">
                                  Next FEFO exp:{' '}
                                  <strong className="text-slate-600 dark:text-slate-300">
                                    {fefo.candidateBatches[0].expiryDate}
                                  </strong>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {formatCurrency(fefo.defaultPrice)}
                        </span>
                        <Button
                          size="sm"
                          disabled={isDepleted}
                          onClick={() => addToCart(med)}
                          variant={isDepleted ? 'outline' : 'clinical'}
                          className="h-8 gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Checkout Cart & FEFO Allocation Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-emerald-200/80 dark:border-emerald-950 shadow-md">
            <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Sale Cart ({cart.length})</span>
                <span className="text-xs font-normal text-slate-500">
                  Branch: {activeBranch.code}
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <ShoppingCart className="w-10 h-10 mx-auto opacity-30" />
                  <p className="text-sm">Cart is empty. Select medicines from the list.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.medicine.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {item.medicine.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatCurrency(item.unitPrice)} × {item.qty} ={' '}
                            <strong>{formatCurrency(item.qty * item.unitPrice)}</strong>
                          </div>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.medicine.id, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(item.medicine.id, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-700 ml-1"
                            onClick={() => removeFromCart(item.medicine.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Live FEFO Allocations breakdown for this cart line */}
                      <div className="text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-800 space-y-1">
                        <div className="text-slate-500 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          FEFO Allocation Plan:
                        </div>
                        {item.fefoBatchesToUse.map((alloc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-mono pl-4"
                          >
                            <span>
                              Batch: <strong>{alloc.batch.batchNumber}</strong> (Exp:{' '}
                              {alloc.batch.expiryDate})
                            </span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              Draws {alloc.take}
                            </span>
                          </div>
                        ))}

                        {/* Near Expiry Warning Badge if drawing from near-expiry batch */}
                        {item.hasNearExpiryStock && (
                          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-[10px] mt-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Near-expiry batch selected (prioritized by FEFO).</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Customer details & Payment Method */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Customer (Optional)</Label>
                    <Input
                      placeholder="e.g. John Doe"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Phone (Optional)</Label>
                    <Input
                      placeholder="+91 98XXX XXXXX"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="h-9 text-xs"
                  >
                    <option value={PaymentMethod.CASH}>Cash Payment</option>
                    <option value={PaymentMethod.CARD}>Credit/Debit Card</option>
                    <option value={PaymentMethod.UPI}>UPI / Digital Payment</option>
                  </Select>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Configured Tax</span>
                  <span>{formatCurrency(taxTotal)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-1 border-t border-slate-200">
                  <span>Grand Total</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <Button
                variant="clinical"
                className="w-full h-11 text-base font-semibold shadow-md gap-2"
                disabled={cart.length === 0 || isSubmitting}
                isLoading={isSubmitting}
                onClick={handleCheckout}
              >
                <CreditCard className="w-5 h-5" />
                Complete Sale ({formatCurrency(grandTotal)})
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
