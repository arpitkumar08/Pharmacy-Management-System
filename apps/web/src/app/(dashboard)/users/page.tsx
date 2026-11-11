'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@pharmacy/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataState } from '@/components/common/data-state';
import { toast } from 'sonner';
import { UserPlus, Users } from 'lucide-react';

export default function UsersPage() {
  const { branches } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.CASHIER);
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ['users'], queryFn: () => apiClient.getUsers() });

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!branchId) { toast.error('Choose a branch for this user.'); return; }
    setSaving(true);
    try {
      await apiClient.createUser({ email: email.trim(), name: name.trim(), password, branchRoles: [{ branchId, role }] });
      toast.success('Staff account created.');
      setOpen(false); setName(''); setEmail(''); setPassword(''); setBranchId(''); setRole(UserRole.CASHIER);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not create staff account.'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await apiClient.updateUser(id, { isActive: !isActive });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      toast.success(isActive ? 'Staff account deactivated.' : 'Staff account reactivated.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update account.'); }
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100"><Users className="h-6 w-6 text-emerald-600" />Staff & Roles</h1>
        <p className="mt-1 text-sm text-slate-500">Create staff accounts, assign branch roles, and disable access when needed.</p>
      </div>
      <Button onClick={() => setOpen(true)} className="gap-2"><UserPlus className="h-4 w-4" />Add staff</Button>
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">Organization staff</CardTitle></CardHeader>
      <CardContent>
        <DataState isLoading={query.isLoading} isError={query.isError} error={query.error as Error} onRetry={() => void query.refetch()} isEmpty={!query.data?.length} emptyTitle="No staff accounts" emptyDescription="Add a user and assign a role to a branch.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-3">Staff member</th><th className="p-3">Branch assignments</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
              <tbody>{query.data?.map(user => <tr key={user.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-3"><div className="font-semibold">{user.name || user.email}</div><div className="text-xs text-slate-500">{user.email}</div></td>
                <td className="p-3"><div className="flex flex-wrap gap-1.5">{user.branchRoles.map((assignment, index) => <Badge key={`${assignment.branchId}-${assignment.role}-${index}`} variant="secondary">{assignment.branchName || assignment.branchId}: {assignment.role}</Badge>)}</div></td>
                <td className="p-3"><Badge variant={user.isActive ? 'clinical' : 'destructive'}>{user.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => void toggleActive(user.id, user.isActive)}>{user.isActive ? 'Deactivate' : 'Reactivate'}</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </DataState>
      </CardContent>
    </Card>

    <Dialog open={open} onOpenChange={setOpen} title="Create staff account" description="A user can only access the branch and role assigned here.">
      <form onSubmit={createUser} className="space-y-4">
        <div><Label required>Full name</Label><Input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={150} required /></div>
        <div><Label required>Email</Label><Input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>
        <div><Label required>Temporary password (12+ characters)</Label><Input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label required>Branch</Label><Select value={branchId} onChange={event => setBranchId(event.target.value)} required><option value="">Choose branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></div>
          <div><Label required>Role</Label><Select value={role} onChange={event => setRole(event.target.value as UserRole)}>{Object.values(UserRole).map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</Select></div>
        </div>
        <Button type="submit" className="w-full" isLoading={saving} disabled={saving}>Create staff account</Button>
      </form>
    </Dialog>
  </div>;
}
