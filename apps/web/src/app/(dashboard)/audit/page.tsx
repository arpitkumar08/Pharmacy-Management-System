'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/common/data-state';
import type { AuditLogSummary } from '@pharmacy/shared';
import { ScrollText, Search, Shield, Eye, Lock } from 'lucide-react';

export default function AuditLogPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogSummary | null>(null);

  const {
    data: logs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => apiClient.getAuditLogs(),
  });

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.entityType.toLowerCase().includes(q) ||
      log.actorEmail?.toLowerCase().includes(q) ||
      log.entityId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-emerald-600" />
            Immutable System Audit Trail
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Append-only compliance log recording all sales, returns, goods receipts, adjustments,
            and access events.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
          <Lock className="w-3.5 h-3.5 text-emerald-600" />
          Tamper-proof PostgreSQL Trigger Enforced
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Search action, actor, entity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <DataState
            isLoading={isLoading}
            isError={isError}
            error={error as Error}
            isEmpty={filteredLogs.length === 0}
            emptyTitle="No audit logs found"
            emptyDescription="No audit logs matched your query."
            onRetry={refetch}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor / User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity Type</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Client IP / Request ID</TableHead>
                  <TableHead className="text-right">Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </TableCell>

                    <TableCell className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {log.actorEmail || 'System / Batch Job'}
                    </TableCell>

                    <TableCell>
                      <Badge variant="clinical" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs font-mono">{log.entityType}</TableCell>

                    <TableCell className="text-xs font-mono text-slate-500">
                      {log.entityId.slice(0, 12)}...
                    </TableCell>

                    <TableCell className="text-xs font-mono text-slate-400">
                      {log.ip || '127.0.0.1'}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataState>
        </CardContent>
      </Card>

      {/* JSON Payload Inspection Dialog */}
      <Dialog
        open={Boolean(selectedLog)}
        onOpenChange={(open) => !open && setSelectedLog(null)}
        title={`Audit Entry — ${selectedLog?.action}`}
        description={`Recorded at ${selectedLog?.createdAt} by ${selectedLog?.actorEmail}`}
        className="max-w-xl"
      >
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Recorded State Mutation (After)
            </h4>
            <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto max-h-60">
              {JSON.stringify(selectedLog?.after || {}, null, 2)}
            </pre>
          </div>

          <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-200">
            <p>
              Request ID:{' '}
              <span className="font-mono">{selectedLog?.requestId || 'req-trace-root'}</span>
            </p>
            <p>
              IP Address: <span className="font-mono">{selectedLog?.ip || '127.0.0.1'}</span>
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
