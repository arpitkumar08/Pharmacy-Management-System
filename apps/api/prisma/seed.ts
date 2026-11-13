import { PrismaClient, UserRole, BatchStatus, MedicineUnit, MovementType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_1_ID = '22222222-2222-2222-2222-222222222221';
const BRANCH_2_ID = '22222222-2222-2222-2222-222222222222';

async function main() {
  console.log('--- Starting idempotent seed ---');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'HealthSphere Pharmacy Group',
      settings: {
        taxRate: 5.0,
        nearExpiryDays: 90,
        returnWindowDays: 30,
        minShelfLifeDays: 0,
      },
    },
  });
  console.log(`Organization seeded: ${org.name} (${org.id})`);

  // 2. Branches
  const branch1 = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: ORG_ID, code: 'BR-CENTRAL' } },
    update: {},
    create: {
      id: BRANCH_1_ID,
      organizationId: ORG_ID,
      name: 'Central Pharmacy - Main Street',
      code: 'BR-CENTRAL',
      timezone: 'UTC',
    },
  });

  const branch2 = await prisma.branch.upsert({
    where: { organizationId_code: { organizationId: ORG_ID, code: 'BR-WESTSIDE' } },
    update: {},
    create: {
      id: BRANCH_2_ID,
      organizationId: ORG_ID,
      name: 'Westside Clinic Pharmacy',
      code: 'BR-WESTSIDE',
      timezone: 'UTC',
    },
  });
  console.log(`Branches seeded: ${branch1.code}, ${branch2.code}`);

  // 3. Invoice Counters
  await prisma.branchInvoiceCounter.upsert({
    where: { branchId: branch1.id },
    update: {},
    create: {
      branchId: branch1.id,
      lastNo: 100,
      year: new Date().getFullYear(),
    },
  });
  await prisma.branchInvoiceCounter.upsert({
    where: { branchId: branch2.id },
    update: {},
    create: {
      branchId: branch2.id,
      lastNo: 50,
      year: new Date().getFullYear(),
    },
  });

  // 4. Users & Roles
  const defaultPasswordHash = await argon2.hash('Password123!');
  const usersData = [
    {
      id: '33333333-3333-3333-3333-333333333331',
      email: 'admin@demo.test',
      name: 'Sarah Connor (Admin)',
      role: UserRole.ORG_ADMIN,
    },
    {
      id: '33333333-3333-3333-3333-333333333332',
      email: 'manager@demo.test',
      name: 'Michael Scott (Manager)',
      role: UserRole.BRANCH_MANAGER,
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'pharmacist@demo.test',
      name: 'Dr. Gregory House (Pharmacist)',
      role: UserRole.PHARMACIST,
    },
    {
      id: '33333333-3333-3333-3333-333333333334',
      email: 'cashier@demo.test',
      name: 'Pam Beesly (Cashier)',
      role: UserRole.CASHIER,
    },
    {
      id: '33333333-3333-3333-3333-333333333335',
      email: 'clerk@demo.test',
      name: 'Dwight Schrute (Inventory Clerk)',
      role: UserRole.INVENTORY_CLERK,
    },
    {
      id: '33333333-3333-3333-3333-333333333336',
      email: 'auditor@demo.test',
      name: 'Oscar Martinez (Auditor)',
      role: UserRole.AUDITOR,
    },
  ];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: ORG_ID, email: u.email } },
      update: { passwordHash: defaultPasswordHash },
      create: {
        id: u.id,
        organizationId: ORG_ID,
        email: u.email,
        name: u.name,
        passwordHash: defaultPasswordHash,
        isActive: true,
      },
    });

    // Assign role to branch1 (and manager/admin to both branches)
    await prisma.userBranchRole.upsert({
      where: {
        userId_branchId_role: {
          userId: user.id,
          branchId: branch1.id,
          role: u.role,
        },
      },
      update: {},
      create: {
        userId: user.id,
        branchId: branch1.id,
        role: u.role,
      },
    });

    if (u.role === UserRole.ORG_ADMIN || u.role === UserRole.BRANCH_MANAGER) {
      await prisma.userBranchRole.upsert({
        where: {
          userId_branchId_role: {
            userId: user.id,
            branchId: branch2.id,
            role: u.role,
          },
        },
        update: {},
        create: {
          userId: user.id,
          branchId: branch2.id,
          role: u.role,
        },
      });
    }
  }
  console.log(`Demo users seeded with argon2 password (Password123!)`);

  // 5. Categories
  const categoriesData = [
    { name: 'Analgesics & Pain Relief', desc: 'Pain management medications' },
    { name: 'Broad-Spectrum Antibiotics', desc: 'Bacterial infection treatments' },
    { name: 'Antihistamines & Allergy', desc: 'Allergy and sinus relief' },
    { name: 'Cardiovascular Health', desc: 'Blood pressure and heart support' },
    { name: 'Gastrointestinal Care', desc: 'Digestive and antacid formulations' },
    { name: 'Respiratory & Bronchodilators', desc: 'Asthma and cough syrups' },
    { name: 'Vitamins & Supplements', desc: 'Daily dietary vitamins' },
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categoriesData) {
    const cat = await prisma.category.upsert({
      where: { organizationId_name: { organizationId: ORG_ID, name: c.name } },
      update: {},
      create: {
        organizationId: ORG_ID,
        name: c.name,
        description: c.desc,
      },
    });
    categoryMap.set(c.name, cat.id);
  }
  console.log(`Categories seeded: ${categoryMap.size}`);

  // 6. Suppliers
  const suppliersData = [
    { name: 'Apex Pharma Distributors', contact: 'dist@apexpharma.test | +1 555-0101' },
    { name: 'BioMed Global Wholesale', contact: 'orders@biomedglobal.test | +1 555-0102' },
    { name: 'CareFirst Life Sciences', contact: 'supply@carefirst.test | +1 555-0103' },
    { name: 'MediCure Logistics', contact: 'dispatch@medicure.test | +1 555-0104' },
  ];

  const supplierMap = new Map<string, string>();
  for (const s of suppliersData) {
    const existing = await prisma.supplier.findFirst({
      where: { organizationId: ORG_ID, name: s.name },
    });
    const sup = existing
      ? await prisma.supplier.update({
          where: { id: existing.id },
          data: { contact: s.contact, isActive: true },
        })
      : await prisma.supplier.create({
          data: { organizationId: ORG_ID, name: s.name, contact: s.contact, isActive: true },
        });
    supplierMap.set(s.name, sup.id);
  }
  console.log(`Suppliers seeded: ${supplierMap.size}`);

  // 7. Medicines (Fictional only)
  const medicinesData = [
    {
      sku: 'MED-ZNT-500',
      name: 'Zentrol 500mg',
      genericName: 'Zentrol Hydrochloride',
      category: 'Analgesics & Pain Relief',
      unit: MedicineUnit.STRIP,
      taxRate: 5.0,
      requiresPrescription: false,
      reorderLevel: 25,
    },
    {
      sku: 'MED-AMX-250',
      name: 'Amoxipen 250mg',
      genericName: 'Amoxipen Trihydrate',
      category: 'Broad-Spectrum Antibiotics',
      unit: MedicineUnit.BOX,
      taxRate: 5.0,
      requiresPrescription: true,
      reorderLevel: 15,
    },
    {
      sku: 'MED-CDP-010',
      name: 'Cardiopress 10mg',
      genericName: 'Cardiopress Tartrate',
      category: 'Cardiovascular Health',
      unit: MedicineUnit.STRIP,
      taxRate: 12.0,
      requiresPrescription: true,
      reorderLevel: 20,
    },
    {
      sku: 'MED-GST-020',
      name: 'Gastrocid 20mg',
      genericName: 'Omegastrocid Sodium',
      category: 'Gastrointestinal Care',
      unit: MedicineUnit.STRIP,
      taxRate: 5.0,
      requiresPrescription: false,
      reorderLevel: 30,
    },
    {
      sku: 'MED-PMC-100',
      name: 'PulmoClear Cough Syrup 100ml',
      genericName: 'Pulmoterol Expectorant',
      category: 'Respiratory & Bronchodilators',
      unit: MedicineUnit.BOTTLE,
      taxRate: 5.0,
      requiresPrescription: false,
      reorderLevel: 10,
    },
    {
      sku: 'MED-ALF-010',
      name: 'AllerFree 10mg',
      genericName: 'Allerfexine Dihydrochloride',
      category: 'Antihistamines & Allergy',
      unit: MedicineUnit.STRIP,
      taxRate: 5.0,
      requiresPrescription: false,
      reorderLevel: 20,
    },
    {
      sku: 'MED-VTB-100',
      name: 'VitaBoost Zinc+C Tablets',
      genericName: 'Multivitamin Complex with Zinc',
      category: 'Vitamins & Supplements',
      unit: MedicineUnit.BOTTLE,
      taxRate: 0.0,
      requiresPrescription: false,
      reorderLevel: 15,
    },
    {
      sku: 'MED-LOW-001',
      name: 'LowStock Relief 50mg',
      genericName: 'Test Relief Compound',
      category: 'Analgesics & Pain Relief',
      unit: MedicineUnit.STRIP,
      taxRate: 5.0,
      requiresPrescription: false,
      reorderLevel: 50, // Deliberately higher than seed batch qty to trigger low stock warning
    },
  ];

  const medMap = new Map<string, string>();
  for (const m of medicinesData) {
    const med = await prisma.medicine.upsert({
      where: { organizationId_sku: { organizationId: ORG_ID, sku: m.sku } },
      update: {},
      create: {
        organizationId: ORG_ID,
        sku: m.sku,
        name: m.name,
        genericName: m.genericName,
        categoryId: categoryMap.get(m.category)!,
        unit: m.unit,
        taxRate: m.taxRate,
        requiresPrescription: m.requiresPrescription,
        reorderLevel: m.reorderLevel,
      },
    });
    medMap.set(m.sku, med.id);
  }
  console.log(`Medicines seeded: ${medMap.size}`);

  // 8. Batches & Initial Stock Movements (with intentional expired & near-expiry test cases)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fortyFiveDaysLater = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const twoYearsLater = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000);

  const batchesData = [
    // Zentrol: FEFO demonstration (Batch 1 expires earlier than Batch 2)
    {
      medicineSku: 'MED-ZNT-500',
      batchNumber: 'ZNT-2025-01',
      expiryDate: fortyFiveDaysLater, // Near expiry (<90 days)
      qty: 40,
      purchasePrice: 12.0,
      salePrice: 20.0,
      status: BatchStatus.ACTIVE,
    },
    {
      medicineSku: 'MED-ZNT-500',
      batchNumber: 'ZNT-2026-02',
      expiryDate: oneYearLater, // Fresh batch
      qty: 100,
      purchasePrice: 12.5,
      salePrice: 20.0,
      status: BatchStatus.ACTIVE,
    },
    // Zentrol: Deliberately EXPIRED batch to test Acceptance Test #2
    {
      medicineSku: 'MED-ZNT-500',
      batchNumber: 'ZNT-EXP-99',
      expiryDate: thirtyDaysAgo, // EXPIRED
      qty: 25,
      purchasePrice: 10.0,
      salePrice: 20.0,
      status: BatchStatus.ACTIVE,
    },
    // Amoxipen: Fresh batch
    {
      medicineSku: 'MED-AMX-250',
      batchNumber: 'AMX-2026-A1',
      expiryDate: oneYearLater,
      qty: 60,
      purchasePrice: 45.0,
      salePrice: 75.0,
      status: BatchStatus.ACTIVE,
    },
    // Cardiopress: Fresh batch
    {
      medicineSku: 'MED-CDP-010',
      batchNumber: 'CDP-2027-01',
      expiryDate: twoYearsLater,
      qty: 80,
      purchasePrice: 30.0,
      salePrice: 50.0,
      status: BatchStatus.ACTIVE,
    },
    // Gastrocid: Fresh batch
    {
      medicineSku: 'MED-GST-020',
      batchNumber: 'GST-2026-G1',
      expiryDate: oneYearLater,
      qty: 75,
      purchasePrice: 15.0,
      salePrice: 25.0,
      status: BatchStatus.ACTIVE,
    },
    // PulmoClear: Fresh batch
    {
      medicineSku: 'MED-PMC-100',
      batchNumber: 'PMC-2026-P1',
      expiryDate: oneYearLater,
      qty: 50,
      purchasePrice: 35.0,
      salePrice: 60.0,
      status: BatchStatus.ACTIVE,
    },
    // AllerFree: Fresh batch
    {
      medicineSku: 'MED-ALF-010',
      batchNumber: 'ALF-2026-F1',
      expiryDate: oneYearLater,
      qty: 90,
      purchasePrice: 8.0,
      salePrice: 15.0,
      status: BatchStatus.ACTIVE,
    },
    // VitaBoost: Fresh batch
    {
      medicineSku: 'MED-VTB-100',
      batchNumber: 'VTB-2026-V1',
      expiryDate: oneYearLater,
      qty: 120,
      purchasePrice: 40.0,
      salePrice: 70.0,
      status: BatchStatus.ACTIVE,
    },
    // LowStock item: only 8 units seeded, reorderLevel is 50 -> low stock alert
    {
      medicineSku: 'MED-LOW-001',
      batchNumber: 'LOW-2026-01',
      expiryDate: oneYearLater,
      qty: 8,
      purchasePrice: 5.0,
      salePrice: 10.0,
      status: BatchStatus.ACTIVE,
    },
  ];

  for (const b of batchesData) {
    const medId = medMap.get(b.medicineSku)!;
    const batch = await prisma.batch.upsert({
      where: {
        branchId_medicineId_batchNumber: {
          branchId: branch1.id,
          medicineId: medId,
          batchNumber: b.batchNumber,
        },
      },
      update: {
        qtyOnHand: b.qty,
        expiryDate: b.expiryDate,
        purchasePrice: b.purchasePrice,
        salePrice: b.salePrice,
      },
      create: {
        organizationId: ORG_ID,
        branchId: branch1.id,
        medicineId: medId,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        qtyOnHand: b.qty,
        purchasePrice: b.purchasePrice,
        salePrice: b.salePrice,
        status: b.status,
      },
    });

    // Check if opening movement exists, if not create it
    const existingMovement = await prisma.stockMovement.findFirst({
      where: {
        batchId: batch.id,
        type: MovementType.OPENING,
      },
    });

    if (!existingMovement) {
      await prisma.stockMovement.create({
        data: {
          organizationId: ORG_ID,
          branchId: branch1.id,
          batchId: batch.id,
          medicineId: medId,
          type: MovementType.OPENING,
          qtyDelta: b.qty,
          balanceAfter: b.qty,
          refType: 'OPENING_STOCK',
          refId: batch.id,
        },
      });
    }
  }
  console.log(
    `Batches seeded with opening ledger movements (FEFO, Expired, Near-Expiry, and Low-Stock test cases ready).`,
  );

  // 9. Customers
  const customers = [
    { name: 'John Doe (Walk-in)', phone: '+1 555-9001' },
    { name: 'Jane Smith', phone: '+1 555-9002' },
  ];
  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: { organizationId: ORG_ID, name: customer.name, phone: customer.phone },
    });
    if (!existing) await prisma.customer.create({ data: { organizationId: ORG_ID, ...customer } });
  }

  console.log('--- Seed completed successfully! ---');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
