import { UserRole } from '@pharmacy/shared';

// These are login shortcuts only. User profiles, branches, catalog, and stock
// are always loaded from the API and persisted in PostgreSQL.
export const DEMO_USERS = {
  admin: { email: 'admin@demo.test', passwordHint: 'Password123!', role: UserRole.ORG_ADMIN },
  manager: { email: 'manager@demo.test', passwordHint: 'Password123!', role: UserRole.BRANCH_MANAGER },
  pharmacist: { email: 'pharmacist@demo.test', passwordHint: 'Password123!', role: UserRole.PHARMACIST },
  cashier: { email: 'cashier@demo.test', passwordHint: 'Password123!', role: UserRole.CASHIER },
  clerk: { email: 'clerk@demo.test', passwordHint: 'Password123!', role: UserRole.INVENTORY_CLERK },
  auditor: { email: 'auditor@demo.test', passwordHint: 'Password123!', role: UserRole.AUDITOR },
} as const;
