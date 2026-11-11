'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { PERMISSIONS } from '@pharmacy/shared';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Boxes,
  SlidersHorizontal,
  Pill,
  Truck,
  FileSpreadsheet,
  ScrollText,
  Activity,
  Users,
  Settings2,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  const navItems = [
    {
      title: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      title: 'POS / New Sale',
      href: '/pos',
      icon: ShoppingCart,
      visible: hasPermission(PERMISSIONS.SALES_CREATE),
    },
    {
      title: 'Sales & Returns',
      href: '/sales',
      icon: Receipt,
      visible: hasPermission(PERMISSIONS.SALES_READ),
    },
    {
      title: 'Batches & Stock',
      href: '/inventory',
      icon: Boxes,
      visible: hasPermission(PERMISSIONS.INVENTORY_READ),
    },
    {
      title: 'Stock Adjustments',
      href: '/inventory/adjustments',
      icon: SlidersHorizontal,
      visible: hasPermission(PERMISSIONS.INVENTORY_ADJUST),
    },
    {
      title: 'Medicines Catalog',
      href: '/medicines',
      icon: Pill,
      visible: hasPermission(PERMISSIONS.CATALOG_READ),
    },
    {
      title: 'Purchasing & POs',
      href: '/purchasing',
      icon: Truck,
      visible: hasPermission(PERMISSIONS.PURCHASES_READ),
    },
    {
      title: 'Reports & Audit',
      href: '/reports',
      icon: FileSpreadsheet,
      visible: hasPermission(PERMISSIONS.REPORTS_READ),
    },
    {
      title: 'Audit Log Trail',
      href: '/audit',
      icon: ScrollText,
      visible: hasPermission(PERMISSIONS.AUDIT_READ),
    },
    {
      title: 'Staff & Roles',
      href: '/users',
      icon: Users,
      visible: hasPermission(PERMISSIONS.USERS_MANAGE),
    },
    {
      title: 'Branches & Settings',
      href: '/settings',
      icon: Settings2,
      visible: hasPermission(PERMISSIONS.BRANCHES_MANAGE),
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shrink-0 min-h-[calc(100vh-4rem)]">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-emerald-700 flex items-center justify-center text-white shadow-xs">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              PharmaCore OS
            </h1>
            <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider">
              Inventory & FEFO System
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1" aria-label="Main navigation">
          {navItems
            .filter((item) => item.visible)
            .map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>{item.title}</span>
                </Link>
              );
            })}
        </nav>
      </div>

      {/* System info footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
        <p className="font-medium text-slate-600 dark:text-slate-300">Algions AI Labs Evaluation</p>
        <p className="mt-0.5">Multi-Branch Tenancy + FEFO</p>
      </div>
    </aside>
  );
}
