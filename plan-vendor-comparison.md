# Vendor Comparison Implementation Plan

## Overview

A feature that allows couples to compare multiple vendors side-by-side for the same service type (e.g., compare 3 photographers). Helps make informed decisions by showing quotes, reviews, availability, and key differentiators in a unified view.

---

## Current State

**Existing models:**
- `Supplier` - vendors with status, contract value, notes
- `SupplierCategory` - service type categories (Photography, Catering, etc.)
- `Attachment` - files attached to suppliers

**Current comparison capabilities:**
- Can view suppliers list filtered by category
- Each supplier has its own detail page
- No side-by-side comparison view
- No structured quote data (just free-text notes)
- No rating/review system

---

## Proposed Architecture

### 1. Database Schema Changes

```prisma
model Supplier {
  // ... existing fields ...

  // New fields for comparison
  rating          Float?          // 1-5 stars (optional)
  reviewNotes     String?         // Internal review notes
  availability    String?         // "Available", "Limited", "Booked"
  availabilityNotes String?       // "Only morning slots available"

  // Structured quote data
  quoteAmount     Float?          // Formal quoted price
  quoteDate       DateTime?       // When quote was received
  quoteExpiresAt  DateTime?       // Quote validity date
  depositAmount   Float?          // Required deposit
  depositPercent  Float?          // Deposit as % of total

  // Differentiators (structured)
  includesEditing Boolean?       // For photographers: editing included
  includesAlbum   Boolean?       // Wedding album included
  hoursIncluded   Float?         // Hours of coverage
  travelIncluded  Boolean?       // Travel fees included
  customFields    Json?          // Flexible key-value pairs

  // Comparison grouping
  comparisonGroup String?         // UUID for grouping suppliers to compare
  comparisonSlot Int?            // Position in comparison (1, 2, 3)
}

model SupplierComparison {
  id           String   @id @default(cuid())
  weddingId    String
  wedding      Wedding  @relation(fields: [weddingId], references: [id], onDelete: Cascade)

  name         String   // "Photography Comparison", "Catering Quotes"
  categoryId   String   // SupplierCategory being compared
  category     SupplierCategory @relation(fields: [categoryId], references: [id])

  supplierIds  String[] // Array of supplier IDs in this comparison
  // Or use a junction table for more flexibility

  criteria     Json?    // Comparison criteria weighting: { "price": 0.3, "quality": 0.5, "availability": 0.2 }

  selectedSupplierId String? // Which supplier was chosen (after decision)
  decisionNotes String?      // Why this supplier was chosen

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([weddingId])
  @@index([categoryId])
}
```

**Alternative approach:** Use a lighter touch - just add comparison fields to Supplier and create a comparison view that groups suppliers by category. No separate `SupplierComparison` model needed if comparison is ephemeral (not saved).

---

### 2. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/suppliers/compare` | POST | Get comparison data for selected suppliers |
| `/api/suppliers/comparisons` | GET | List saved comparisons |
| `/api/suppliers/comparisons` | POST | Save a comparison group |
| `/api/suppliers/comparisons/[id]` | DELETE | Delete saved comparison |

**POST `/api/suppliers/compare` request:**
```json
{
  "supplierIds": ["s1", "s2", "s3"],
  "fields": ["rating", "quoteAmount", "hoursIncluded", "includesAlbum"]
}
```

**Response:**
```json
{
  "suppliers": [
    {
      "id": "s1",
      "name": "Studio A Photography",
      "rating": 4.8,
      "quoteAmount": 2500,
      "hoursIncluded": 8,
      "includesAlbum": true,
      "includesEditing": true,
      "depositAmount": 500,
      "availability": "Available",
      "attachments": [{ "id": "a1", "filename": "quote.pdf" }]
    }
  ],
  "category": {
    "id": "cat1",
    "name": "Photography",
    "colour": "#ec4899"
  },
  "comparisonMatrix": {
    "bestPrice": { "supplierId": "s2", "value": 2000 },
    "bestRating": { "supplierId": "s1", "value": 4.8 },
    "bestValue": { "supplierId": "s1", "value": "$312/hr" } // quoteAmount / hoursIncluded
  }
}
```

---

### 3. UI Components

#### Comparison Picker (`/suppliers/compare`)
- Launch point: SupplierList → "Compare" button (visible when ≥2 suppliers in category)
- Category selector (which type of vendor to compare)
- Supplier multi-select (checkboxes)
- "Start comparison" button → navigates to comparison view

#### Comparison View (`/suppliers/compare?[ids]=...`)
- Side-by-side columns (2-4 suppliers)
- Header row: Supplier name, rating, status
- Comparison rows grouped by category:
  - **Pricing**: Quote amount, deposit, per-hour rate
  - **Services**: Hours included, deliverables (album, editing)
  - **Logistics**: Availability, travel included
  - **Quality**: Rating, reviews
  - **Documents**: Attached quotes, contracts

#### ComparisonMatrix Component
- Responsive grid (scrolls horizontally on mobile)
- Column per supplier
- Row per comparison criterion
- Highlight best value in each row (green)
- Allow user to mark "important" rows (stars)

#### ComparisonSummary
- "Best for price" badge
- "Best for value" badge
- "Best rated" badge
- Overall recommendation (if criteria weighted)

#### ComparisonActions
- "Select this vendor" button on each column
- "Save comparison" to revisit later
- "Print comparison" for offline review
- "Export to PDF"

---

### 4. Category-Specific Comparison Fields

Different supplier categories need different comparison criteria:

**Photography/Videography:**
- Hours included
- Second photographer included
- Editing included
- Album included
- Engagement shoot included
- Digital files included
- Turnaround time (weeks)

**Catering:**
- Price per head
- Minimum guests
- Tasting included
- Service style (buffet/plated/family)
- Dietary accommodations
- Staff included

**Venue:**
- Capacity
- Rental fee
- Includes tables/chairs/linens
- Includes catering
- Includes bar service
- Parking available
- Outdoor space

**Florist:**
- Centerpieces included
- Bridal bouquet included
- Ceremony arrangements
- Setup/breakdown included
- Vase rentals

**DJ/Band:**
- Hours included
- Number of musicians
- MC services included
- Lighting included
- Sound equipment included
- Learning special songs

Implementation: `customFields` JSON column stores category-specific fields as key-value pairs.

---

### 5. Implementation Phases

#### Phase 1: Database + Supplier Fields (Day 1)
1. Add comparison fields to Supplier model (rating, quoteAmount, etc.)
2. Create migration
3. Update SupplierModal to include comparison fields
4. Update SupplierDetail to show/edit comparison fields
5. Add "Quote" section to supplier detail

#### Phase 2: Comparison Picker (Day 2)
1. Add "Compare" button to SupplierList (category header)
2. Create comparison picker modal
3. Multi-select suppliers within category
4. Navigate to comparison view with supplier IDs

#### Phase 3: Comparison View (Day 3)
1. Create comparison page component
2. Create ComparisonMatrix component
3. Side-by-side column layout
4. Highlight best values
5. Category-specific row templates

#### Phase 4: Comparison Actions (Day 4)
1. "Select vendor" action (sets supplier status to BOOKED)
2. Save comparison to revisit
3. Print/export comparison
4. Comparison history view

#### Phase 5: Polish (Day 5)
1. Weighted criteria (user sets importance)
2. Mobile responsive (horizontal scroll)
3. Comparison sharing (link)
4. Decision notes field

---

### 6. Permissions

| Action | ADMIN | VIEWER | RSVP_MANAGER |
|--------|-------|--------|---------------|
| View comparisons | ✅ | ✅ | ❌ |
| Create comparisons | ✅ | ❌ | ❌ |
| Edit supplier comparison fields | ✅ | ❌ | ❌ |

---

### 7. Files to Create/Modify

**New files:**
- `src/app/(dashboard)/suppliers/compare/page.tsx` - Comparison view page
- `src/components/suppliers/ComparisonPicker.tsx` - Supplier selection modal
- `src/components/suppliers/ComparisonMatrix.tsx` - Side-by-side comparison grid
- `src/components/suppliers/ComparisonSummary.tsx` - Best value badges
- `src/app/api/suppliers/compare/route.ts` - POST comparison data
- `src/lib/comparison-fields.ts` - Category-specific field definitions

**Modified files:**
- `prisma/schema.prisma` - Add comparison fields to Supplier
- `src/components/suppliers/SupplierList.tsx` - Add "Compare" button
- `src/components/suppliers/SupplierModal.tsx` - Add comparison fields
- `src/components/suppliers/SupplierDetail.tsx` - Add comparison fields section
- `src/app/api/suppliers/[id]/route.ts` - Handle comparison fields

---

### 8. Migration SQL

```sql
-- Add comparison fields to Supplier
ALTER TABLE "Supplier" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN "reviewNotes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "availability" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "availabilityNotes" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "quoteAmount" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN "quoteDate" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN "quoteExpiresAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN "depositAmount" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN "depositPercent" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN "includesEditing" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "includesAlbum" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "hoursIncluded" DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN "travelIncluded" BOOLEAN;
ALTER TABLE "Supplier" ADD COLUMN "customFields" JSONB;
```

---

### 9. Edge Cases

1. **Comparing suppliers from different categories** - Not allowed, must be same category
2. **Only one supplier in category** - Compare button disabled
3. **No quote data entered** - Show "Not quoted" placeholder
4. **Expired quotes** - Highlight in amber with expiration date
5. **Already booked supplier** - Show BOOKED badge, still allow comparison
6. **Different units** - Normalize (e.g., price per hour for hourly vs package)

---

### 10. Future Enhancements

- Weighted scoring (user sets criteria importance)
- Comparison sharing with partner/family
- Vendor review import from external sources (Google, Yelp)
- Automatic "best value" calculation based on criteria
- Historical comparison archive
- Integration with tasks ("Compare photographers" task)
- Email comparison PDF to partner for review