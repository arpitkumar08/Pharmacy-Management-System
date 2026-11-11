'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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
import { MedicineUnit } from '@pharmacy/shared';
import { toast } from 'sonner';
import { Pill, Plus, Search, ShieldCheck } from 'lucide-react';

export default function MedicinesPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unit, setUnit] = useState<MedicineUnit>(MedicineUnit.STRIP);
  const [taxRate, setTaxRate] = useState<number>(12);
  const [requiresPrescription, setRequiresPrescription] = useState(false);
  const [reorderLevel, setReorderLevel] = useState<number>(30);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: medicines = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['medicines'],
    queryFn: () => apiClient.getMedicines(),
  });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.getCategories() });

  const filtered = medicines.filter((m) => {
    if (categoryFilter !== 'ALL' && m.categoryId !== categoryFilter) return false;
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.sku.toLowerCase().includes(q) ||
      (m.genericName && m.genericName.toLowerCase().includes(q))
    );
  });

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) {
      toast.error('SKU and Medicine Name are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.createMedicine({
        sku: sku.trim(),
        name: name.trim(),
        genericName: genericName.trim() || undefined,
        categoryId,
        unit,
        taxRate: Number(taxRate),
        requiresPrescription,
        reorderLevel: Number(reorderLevel),
      });

      toast.success(`Medicine '${name}' successfully added to catalog!`);
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      setIsAddModalOpen(false);

      // Reset form
      setSku('');
      setName('');
      setGenericName('');
    } catch {
      toast.error('Failed to create medicine.');
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
            <Pill className="w-6 h-6 text-emerald-600" />
            Medicines & Catalog Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organization-level pharmaceutical catalog, SKU classification, and reorder levels.
          </p>
        </div>

        <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add New Medicine
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Search by brand, SKU, or generic composition..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-xs"
              />
            </div>
          </div>

          <DataState
            isLoading={isLoading}
            isError={isError}
            error={error as Error}
            isEmpty={filtered.length === 0}
            emptyTitle="No medicines in catalog"
            emptyDescription="No medicines matched the current query."
            onRetry={refetch}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Brand Name</TableHead>
                  <TableHead>Generic Composition</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Packaging Unit</TableHead>
                  <TableHead className="text-center">Tax Rate</TableHead>
                  <TableHead className="text-center">Reorder Threshold</TableHead>
                  <TableHead className="text-center">Prescription</TableHead>
                  <TableHead className="text-right">Total Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((med) => (
                  <TableRow key={med.id}>
                    <TableCell className="font-mono text-xs font-semibold text-slate-500">
                      {med.sku}
                    </TableCell>

                    <TableCell className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {med.name}
                    </TableCell>

                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                      {med.genericName || '—'}
                    </TableCell>

                    <TableCell className="text-xs text-slate-500">
                      {med.categoryName || 'General Therapeutics'}
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs">{med.unit}</TableCell>

                    <TableCell className="text-center text-xs font-semibold">
                      {med.taxRate}%
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs text-slate-600">
                      {med.reorderLevel}
                    </TableCell>

                    <TableCell className="text-center">
                      {med.requiresPrescription ? (
                        <Badge variant="warning" className="text-[10px]">
                          Rx Req
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          OTC
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-bold text-sm text-emerald-700 dark:text-emerald-400">
                      {med.totalStock ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataState>
        </CardContent>
      </Card>

      {/* Add New Medicine Modal */}
      <Dialog
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        title="Register New Medicine in Organization Catalog"
        description="Medicines defined here are available across all branch locations."
      >
        <form onSubmit={handleCreateMedicine} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>SKU Code</Label>
              <Input
                placeholder="e.g. MED-PARA-650"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <Label required>Packaging Unit</Label>
              <Select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MedicineUnit)}
                required
              >
                {Object.values(MedicineUnit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label required>Brand Name</Label>
            <Input
              placeholder="e.g. Zentrol Plus 650mg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Generic / Chemical Formulation</Label>
            <Input
              placeholder="e.g. Paracetamol & Caffeine"
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
            />
          </div>

          <div>
            <Label required>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">-- Choose category --</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Tax Rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div>
              <Label required>Reorder Alert Level</Label>
              <Input
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(parseInt(e.target.value, 10) || 0)}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="prescriptionCheckbox"
              checked={requiresPrescription}
              onChange={(e) => setRequiresPrescription(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label
              htmlFor="prescriptionCheckbox"
              className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none"
            >
              Requires Doctor's Prescription (Schedule H / Rx)
            </label>
          </div>

          <Button
            type="submit"
            variant="default"
            className="w-full"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Save Medicine to Catalog
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
