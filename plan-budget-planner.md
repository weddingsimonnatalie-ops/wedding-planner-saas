# Budget Planner Implementation Plan

## Overview

A comprehensive budget management feature that allows couples to plan, track, and visualize their wedding budget across categories. Integrates with existing suppliers and payments to show "spent" vs "allocated" amounts.

---

## Current State

**Existing models:**
- `Supplier` - has `contractValue` and `payments[]`
- `Payment` - individual payments linked to suppliers
- `SupplierCategory` - categories for suppliers (Venue, Photography, etc.)

**Current budget tracking:**
- Dashboard shows total contracted/paid/remaining
- Suppliers page shows per-supplier totals
- No per-category budget limits or over-budget alerts

---

## Proposed Architecture

### 1. Database Schema Changes

```prisma
model BudgetCategory {
  id           String   @id @default(cuid())
  weddingId    String
  wedding      Wedding  @relation(fields: [weddingId], references: [id], onDelete: Cascade)
  name         String   // "Venue", "Catering", "Photography", etc.
  allocated    Float    // Budget limit for this category
  icon         String?  // Lucide icon name (optional)
  colour       String   @default("#6366f1")
  sortOrder    Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([weddingId, name])
  @@index([weddingId])
}

model Supplier {
  // ... existing fields ...
  budgetCategoryId String?
  budgetCategory   BudgetCategory? @relation(fields: [budgetCategoryId], references: [id], onDelete: SetNull)

  // Note: supplierCategoryId maps to SupplierCategory (type of service)
  // budgetCategoryId maps to BudgetCategory (budget allocation group)
  // These are independent - a "Photography" supplier could be in "Venue" budget category
}
```

**Key design decision:** `BudgetCategory` is separate from `SupplierCategory`:
- `SupplierCategory` = type of service (Photography, Catering, Florist)
- `BudgetCategory` = budget allocation bucket (may group multiple service types or split one type)

Example: You might have a "Venue" budget category that includes the venue rental + catering, while "Photography" is its own category.

---

### 2. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/budget/categories` | GET | List all budget categories with spent/remaining |
| `/api/budget/categories` | POST | Create budget category |
| `/api/budget/categories/[id]` | PUT | Update budget category (name, allocated, colour) |
| `/api/budget/categories/[id]` | DELETE | Delete budget category (unlinks suppliers) |
| `/api/budget/summary` | GET | Overall budget summary (total allocated/spent/remaining) |

**GET `/api/budget/categories` response:**
```json
{
  "categories": [
    {
      "id": "abc123",
      "name": "Venue",
      "allocated": 15000,
      "spent": 5000,
      "remaining": 10000,
      "percentUsed": 33,
      "isOverBudget": false,
      "supplierCount": 2,
      "suppliers": [
        { "id": "s1", "name": "Grand Ballroom", "contractValue": 12000, "paid": 4000 },
        { "id": "s2", "name": "Catering Co", "contractValue": 3000, "paid": 1000 }
      ]
    }
  ],
  "totals": {
    "allocated": 25000,
    "spent": 8000,
    "remaining": 17000,
    "unallocated": 5000
  }
}
```

---

### 3. UI Components

#### Budget Page (`/budget`)
- Header: "Budget" + "Add category" button (ADMIN only)
- Summary bar: Total Allocated | Total Spent | Remaining | Unallocated (suppliers without budget category)
- Category cards grid (responsive 2-3 columns)
- Each card:
  - Category name + icon
  - Progress bar (spent/allocated)
  - Over-budget indicator (red when spent > allocated)
  - Expandable to show linked suppliers
  - Edit/Delete buttons (ADMIN)

#### BudgetCategoryModal
- Form: Name, Allocated amount, Colour picker, Icon selector
- Used for create and edit

#### BudgetCategoryCard
- Displays category summary
- Expandable supplier list
- Progress bar with colour coding (green < 80%, amber < 100%, red >= 100%)

#### Supplier Integration
- Supplier form (both SupplierModal and SupplierDetail) gets a "Budget category" dropdown
- Budget category is optional (supplier can be unallocated)
- SupplierList shows budget category badge when assigned

---

### 4. Dashboard Integration

Add new "Budget breakdown" widget:
- Pie/donut chart showing spent per category
- Click category → navigate to `/budget`
- Show over-budget categories in red

Or enhance existing "Budget overview" card:
- Add category breakdown toggle
- Show top 3 categories by spend

---

### 5. Implementation Phases

#### Phase 1: Database + Basic CRUD (Day 1)
1. Create migration for `BudgetCategory` model and `Supplier.budgetCategoryId` field
2. Create `/api/budget/categories` routes (GET, POST)
3. Create `/api/budget/categories/[id]` routes (PUT, DELETE)
4. Create `/api/budget/summary` route
5. Seed default budget categories (optional - or let users create)

#### Phase 2: Budget Page UI (Day 2)
1. Create `/budget` page component
2. Create `BudgetList` client component (follows SupplierList pattern)
3. Create `BudgetCategoryCard` component
4. Create `BudgetCategoryModal` for add/edit
5. Implement category CRUD with optimistic updates

#### Phase 3: Supplier Integration (Day 3)
1. Update `SupplierModal` to include budget category dropdown
2. Update `SupplierDetail` to show/edit budget category
3. Update `SupplierList` to show budget category badge
4. Update `GET /api/suppliers` to include budget category
5. Update `POST/PUT /api/suppliers` to accept budgetCategoryId

#### Phase 4: Dashboard Widget (Day 4)
1. Create `BudgetBreakdownWidget` component
2. Add to dashboard (or enhance existing budget card)
3. Add navigation link to `/budget` in sidebar

#### Phase 5: Polish (Day 5)
1. Mobile responsive design
2. Over-budget alerts/notifications
3. Budget vs actual report view
4. Export budget to CSV
5. Budget category icons

---

### 6. Permissions

| Action | ADMIN | VIEWER | RSVP_MANAGER |
|--------|-------|--------|---------------|
| View budget | ✅ | ✅ | ❌ |
| Create/edit/delete categories | ✅ | ❌ | ❌ |
| Assign suppliers to categories | ✅ | ❌ | ❌ |

RSVP_MANAGER should not see budget page at all (finance data).

---

### 7. Files to Create/Modify

**New files:**
- `src/app/(dashboard)/budget/page.tsx` - Budget page (server component)
- `src/components/budget/BudgetList.tsx` - Main client component
- `src/components/budget/BudgetCategoryCard.tsx` - Category display card
- `src/components/budget/BudgetCategoryModal.tsx` - Add/edit modal
- `src/app/api/budget/categories/route.ts` - GET, POST
- `src/app/api/budget/categories/[id]/route.ts` - PUT, DELETE
- `src/app/api/budget/summary/route.ts` - GET

**Modified files:**
- `prisma/schema.prisma` - Add BudgetCategory model
- `src/components/suppliers/SupplierModal.tsx` - Add budget category dropdown
- `src/components/suppliers/SupplierDetail.tsx` - Show/edit budget category
- `src/components/suppliers/SupplierList.tsx` - Show budget category badge
- `src/components/LayoutShell.tsx` - Add Budget nav item
- `src/components/dashboard/DashboardClient.tsx` - Add budget breakdown widget
- `src/lib/permissions.ts` - Add `accessBudget`, `editBudget` helpers
- `src/hooks/usePermissions.ts` - Expose budget permissions
- `src/middleware.ts` - Protect `/budget/*` routes (redirect RSVP_MANAGER)

---

### 8. Migration SQL

```sql
-- Create BudgetCategory table
CREATE TABLE "BudgetCategory" (
  "id" TEXT NOT NULL,
  "weddingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "allocated" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "icon" TEXT,
  "colour" TEXT NOT NULL DEFAULT '#6366f1',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BudgetCategory_weddingId_name_key" ON "BudgetCategory"("weddingId", "name");
CREATE INDEX "BudgetCategory_weddingId_idx" ON "BudgetCategory"("weddingId");

-- Add budgetCategoryId to Supplier
ALTER TABLE "Supplier" ADD COLUMN "budgetCategoryId" TEXT;
CREATE INDEX "Supplier_budgetCategoryId_idx" ON "Supplier"("budgetCategoryId");

-- Add foreign key constraint
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_budgetCategoryId_fkey"
  FOREIGN KEY ("budgetCategoryId") REFERENCES "BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key constraint for BudgetCategory -> Wedding
ALTER TABLE "BudgetCategory" ADD CONSTRAINT "BudgetCategory_weddingId_fkey"
  FOREIGN KEY ("weddingId") REFERENCES "Wedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

### 9. Edge Cases

1. **Supplier without budget category** - Shows in "Unallocated" section, counted in totals
2. **Over-budget category** - Red progress bar, negative remaining shown
3. **Deleting budget category** - Unlinks all suppliers, doesn't delete them
4. **Category with no suppliers** - Shows allocated $0 spent, not over-budget
5. **Negative allocation** - Not allowed (validation)
6. **Duplicate category names** - Prevented by unique constraint

---

### 10. Future Enhancements

- Budget templates (preset categories for typical weddings)
- Budget vs actual comparison report
- Monthly burn rate tracking
- Budget alerts (email when category reaches 80%/100%)
- Multi-currency support
- Budget sharing with partner/family