'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DEMO_USERS } from '@/lib/mock-data';
import { toast } from 'sonner';
import { Activity, Lock, ArrowRight, ShieldCheck, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, quickLoginAs } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      toast.success('Authenticated successfully! Welcome back.');
      router.push('/');
    } else {
      toast.error(result.error);
    }
  };

  const handleQuickLogin = async (roleKey: keyof typeof DEMO_USERS) => {
    const demo = DEMO_USERS[roleKey];
    if (demo) {
      setIsLoading(true);
      const result = await quickLoginAs(roleKey);
      setIsLoading(false);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Logged in as ${demo.email} (${demo.role})`);
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-emerald-700 text-white items-center justify-center shadow-md">
            <Activity className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            PharmaCore OS
          </h1>
          <p className="text-xs text-slate-500">
            Multi-Branch Tenancy • Strict FEFO Inventory & Compliance
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-slate-200/80 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">Staff Authentication</CardTitle>
            <CardDescription className="text-xs">
              Enter your organization credentials or choose a pre-configured role below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label required>Staff Email Address</Label>
                <Input
                  type="email"
                  placeholder="name@pharmacy.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label required>Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                variant="clinical"
                className="w-full h-10 font-semibold"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Sign In to Branch
              </Button>
            </form>

            {/* Evaluator Quick-Login helper */}
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Evaluator 1-Click Role Login:
                </span>
                <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {(
                  [
                    { key: 'pharmacist', label: 'Pharmacist', color: 'clinical' },
                    { key: 'cashier', label: 'Cashier', color: 'default' },
                    { key: 'admin', label: 'Org Admin', color: 'destructive' },
                    { key: 'manager', label: 'Branch Mgr', color: 'warning' },
                    { key: 'clerk', label: 'Inventory Clerk', color: 'secondary' },
                    { key: 'auditor', label: 'Auditor', color: 'outline' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleQuickLogin(key)}
                    className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition-colors text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {label}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {DEMO_USERS[key]?.email.split('@')[0]}
                      </div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
