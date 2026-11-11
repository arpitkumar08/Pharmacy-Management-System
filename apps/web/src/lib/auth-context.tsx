'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { UserSummary, BranchSummary } from '@pharmacy/shared';
import { UserRole, ROLE_PERMISSIONS, type Permission } from '@pharmacy/shared';
import { DEMO_USERS } from './mock-data';
import { ApiError, apiClient } from './api-client';

type LoginResult = { success: true } | { success: false; error: string };

interface AuthContextType {
  user: UserSummary | null;
  role: UserRole;
  activeBranch: BranchSummary;
  branches: BranchSummary[];
  setActiveBranch: (branch: BranchSummary) => void;
  refreshBranches: () => Promise<void>;
  login: (email: string, pass: string) => Promise<LoginResult>;
  quickLoginAs: (roleKey: keyof typeof DEMO_USERS) => Promise<LoginResult>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  isLoading: boolean;
}
const EMPTY_BRANCH: BranchSummary = { id: '', organizationId: '', name: 'Select a branch', code: '', timezone: 'UTC' };
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<UserSummary | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [activeBranch, setActiveBranchState] = useState<BranchSummary>(EMPTY_BRANCH);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [current, available] = await Promise.all([apiClient.getMe(), apiClient.getBranches()]);
        if (!alive) return;
        setUser(current);
        setBranches(available);
        let selected: BranchSummary | undefined;
        try { const saved = JSON.parse(localStorage.getItem('pharmacore_branch') || 'null'); selected = available.find(b => b.id === saved?.id); } catch {}
        setActiveBranch(selected || available[0] || EMPTY_BRANCH);
      } catch {
        if (alive) { setUser(null); setBranches([]); setActiveBranchState(EMPTY_BRANCH); }
      } finally { if (alive) setIsLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const setActiveBranch = (branch: BranchSummary) => {
    setActiveBranchState(branch);
    try { localStorage.setItem('pharmacore_branch', JSON.stringify(branch)); } catch {}
    void queryClient.invalidateQueries();
  };
  const refreshBranches = async () => {
    const available = await apiClient.getBranches();
    setBranches(available);
    const selected = available.find(branch => branch.id === activeBranch.id) || available[0];
    if (selected) setActiveBranch(selected);
  };
  const branchRole = user?.branchRoles.find(br => br.branchId === activeBranch.id);
  const role = branchRole?.role || user?.branchRoles[0]?.role || UserRole.PHARMACIST;
  const hasPermission = (permission: Permission) => !!user && (ROLE_PERMISSIONS[role] || []).includes(permission);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const result = await apiClient.login({ email, password: pass });
      const [available] = await Promise.all([apiClient.getBranches()]);
      const current = result.user;
      setUser(current); setBranches(available);
      const branch = available.find(b => current.branchRoles.some(r => r.branchId === b.id)) || available[0] || EMPTY_BRANCH;
      setActiveBranch(branch);
      return { success: true } as const;
    } catch (error) {
      let message: string;
      if (error instanceof ApiError) {
        message = error.status >= 500
          ? 'The API could not reach its database. Check your network connection and try again.'
          : error.detail || 'Sign-in failed.';
      } else if (error instanceof TypeError) {
        message = 'Could not reach the API. Check that it is running and try again.';
      } else {
        message = 'Sign-in failed. Please try again.';
      }
      return { success: false, error: message } as const;
    } finally { setIsLoading(false); }
  };
  const quickLoginAs = async (roleKey: keyof typeof DEMO_USERS) => {
    const demo = DEMO_USERS[roleKey];
    return demo
      ? login(demo.email, demo.passwordHint)
      : { success: false, error: 'This demo role is not configured.' } as const;
  };
  const logout = () => {
    void apiClient.logout().catch(() => undefined);
    setUser(null); setBranches([]); setActiveBranchState(EMPTY_BRANCH);
    try { localStorage.removeItem('pharmacore_branch'); } catch {}
    router.push('/login');
  };

  const value = useMemo(() => ({ user, role, activeBranch, branches, setActiveBranch, refreshBranches, login, quickLoginAs, logout, hasPermission, isLoading }), [user, role, activeBranch, branches, isLoading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
