'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { DataState } from '@/components/common/data-state';

export default function SettingsPage() {
  const { branches, refreshBranches } = useAuth();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['organization-settings'], queryFn: apiClient.getOrganizationSettings });
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [message, setMessage] = useState('');
  useEffect(() => { if (settingsQuery.data) setSettings(settingsQuery.data.settings || {}); }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: () => apiClient.updateOrganizationSettings(settings),
    onSuccess: () => { setMessage('Organization settings saved.'); void queryClient.invalidateQueries({ queryKey: ['organization-settings'] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not save settings.'),
  });
  const addBranch = useMutation({
    mutationFn: () => apiClient.createBranch({ name: branchName.trim(), code: branchCode.trim(), timezone }),
    onSuccess: async () => { setBranchName(''); setBranchCode(''); setMessage('Branch created.'); await refreshBranches(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Could not create branch.'),
  });

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Branches & Settings</h1><p className="text-sm text-slate-500">Manage organization operating settings and branch locations.</p></div>
    {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-700"/><h2 className="font-semibold">Branches</h2></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Name</th><th>Code</th><th>Timezone</th></tr></thead><tbody>{branches.map(branch => <tr key={branch.id} className="border-b last:border-0"><td className="py-2">{branch.name}</td><td>{branch.code}</td><td>{branch.timezone}</td></tr>)}</tbody></table></div>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={event => { event.preventDefault(); addBranch.mutate(); }}>
        <Input aria-label="Branch name" placeholder="Branch name" value={branchName} onChange={event => setBranchName(event.target.value)} required minLength={2}/>
        <Input aria-label="Branch code" placeholder="Branch code" value={branchCode} onChange={event => setBranchCode(event.target.value)} required minLength={2}/>
        <Input aria-label="Timezone" placeholder="Timezone" value={timezone} onChange={event => setTimezone(event.target.value)} required/>
        <Button type="submit" isLoading={addBranch.isPending}><Plus className="mr-2 h-4 w-4"/>Add branch</Button>
      </form>
    </Card>
    <Card className="p-5 space-y-4">
      <h2 className="font-semibold">Pharmacy operating settings</h2>
      <DataState isLoading={settingsQuery.isLoading} error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">Near-expiry warning (days)<Input type="number" min="1" value={Number(settings.nearExpiryDays ?? 90)} onChange={event => setSettings(current => ({ ...current, nearExpiryDays: Number(event.target.value) }))}/></label>
          <label className="space-y-1 text-sm">Default tax rate (%)<Input type="number" min="0" max="100" step="0.01" value={Number(settings.defaultTaxRate ?? 0)} onChange={event => setSettings(current => ({ ...current, defaultTaxRate: Number(event.target.value) }))}/></label>
          <label className="space-y-1 text-sm">Currency code<Input maxLength={3} value={String(settings.currency ?? 'INR')} onChange={event => setSettings(current => ({ ...current, currency: event.target.value.toUpperCase() }))}/></label>
        </div>
        <Button onClick={() => saveSettings.mutate()} isLoading={saveSettings.isPending}><Save className="mr-2 h-4 w-4"/>Save settings</Button>
      </DataState>
    </Card>
  </div>;
}
