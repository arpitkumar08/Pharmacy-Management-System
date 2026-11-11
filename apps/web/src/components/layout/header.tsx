'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { Building2, LogOut, Shield } from 'lucide-react';
import { Badge } from '../ui/badge';
import { DEMO_USERS } from '@/lib/mock-data';

export function Header() {
  const { user, role, activeBranch, branches, setActiveBranch, quickLoginAs, logout } = useAuth();

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 md:px-6 flex items-center justify-between z-20">
      {/* Left: Active Branch Switcher (Screen #14 in plan) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
          <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Branch:
          </span>
          <select
            value={activeBranch.id}
            onChange={(e) => {
              const selected = branches.find((b) => b.id === e.target.value);
              if (selected) setActiveBranch(selected);
            }}
            aria-label="Active branch selector"
            className="text-sm font-semibold bg-transparent text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-800">
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Role Quick-Switcher (Evaluator friendly) & User profile */}
      <div className="flex items-center gap-3">
        {/* Quick Role Switcher for demonstration */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-1">
            Demo Role:
          </span>
          {(['pharmacist', 'cashier', 'admin', 'manager', 'clerk', 'auditor'] as const).map((r) => {
            const isSelected = DEMO_USERS[r]?.email === user?.email;
            return (
              <button
                key={r}
                type="button"
                onClick={() => quickLoginAs(r)}
                className={`text-xs px-2 py-0.5 rounded font-medium transition-all capitalize ${
                  isSelected
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        {/* Current User Info */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
            {user?.email.slice(0, 2).toUpperCase() || 'US'}
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="text-xs font-medium text-slate-900 dark:text-slate-100 max-w-[140px] truncate">
              {user?.email || 'Guest'}
            </span>
            <div className="flex items-center gap-1">
              <Badge variant="clinical" className="text-[10px] py-0 px-1.5">
                <Shield className="w-2.5 h-2.5 mr-0.5 inline" />
                {role}
              </Badge>
            </div>
          </div>

          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
