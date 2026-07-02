

# Plan: Analyze & Fix XLSX Data Import for 789 Members

## Data Analysis Summary

The uploaded file has **789 members** across **341 families** with 30 columns. Several data quality issues need fixing during import.

## Issues Found

1. **DOB format**: Uses `M/D/YY` (e.g., `6/29/77`) — some are `0000-00-00` (invalid)
2. **Relationship**: Heads have `N/A` instead of `Head`; includes types not in current system (`Granddaughter`, `Father` used as relationship)
3. **Title/Gender mismatch**: Some females have `Mr` title (e.g., IAG00339-1)
4. **Married column**: Contains anniversary dates (e.g., `6/11/03`) or `N/A` — not a boolean
5. **Baptism/Communion**: Contain dates or `N/A` — need to derive `baptismStatus` from presence of date
6. **Zonal values**: `Zone A`, `Zone B`, `Zone C`, `Zone D` — need proper team mapping
7. **Category field**: Values like `regular`, `occasional_visitor`, `out_station`, `dnd` — maps to `status`
8. **Fellowship field**: `womens`, `mens`, `boys`, `girls`, `childrens` — can derive `maritalStatus` hints
9. **Missing column mappings**: `Mobile` → `phone`, `Tamilname` → `tamilName`, `Tamiladdress` → Tamil address fields, `Member_Type` → `isHeadOfFamily`

## Plan

### Step 1: Update ImportMapperDialog with missing aliases
Add auto-match aliases for all Excel columns:
- `Mobile` → `phone`
- `Member_Type` → `isHeadOfFamily`
- `Tamilname` → `tamilName` (new app field)
- `Tamiladdress` → Tamil address (new app field)
- `Fellowship` → mapping hint field
- `Married` → `anniversaryDate`
- `Baptism` / `Communion` → `baptismDate`
- `Category` → `status`
- `Family_ID` → `familyId`
- `Member_ID` → `memberId`
- `Address` → `place`

Add new APP_FIELDS entries for `tamilName` and `tamilAddress`.

### Step 2: Fix import transformation logic in Members.tsx
Update the `onConfirm` handler to:

- **DOB**: Parse `M/D/YY` format properly using date-fns; treat `0000-00-00` as empty
- **Gender**: Normalize; ignore `Title` field, trust `Gender` column
- **isHeadOfFamily**: Derive from `Member_Type` column (`Head` → true, else false)
- **Relationship**: Convert `N/A` to `Head` for family heads; keep valid values; expand `RelationshipType` to include `Granddaughter`, `Grandson`, `Grandfather`, `Grandmother`
- **maritalStatus**: Derive from `Married` column — if it has a valid date → `married`, else `single`; also check `Fellowship` (`womens`/`mens` + age hints)
- **anniversaryDate**: Extract date from `Married` column if valid
- **baptismStatus**: If `Baptism` or `Communion` column has a valid date → `baptized`, else `not_baptized`
- **baptismDate**: Use the `Baptism` or `Communion` date value
- **team**: Map `Zone A` → `Zone A`, `Zone B` → `Zone B`, etc. (keep the full value, don't convert "Zone" to "Team")
- **status**: Map `Category` values — `regular`, `occasional_visitor` stay as-is; `out_station` → `long_absent`; `dnd` → `long_absent`
- **tamilName**: Store from `Tamilname` column
- **tamilAddress**: Store from `Tamiladdress` column
- **phone**: Use `Mobile` column; handle `N/A` as empty
- **memberId/familyId**: Use existing IDs from file (`IAG00001`, `IAG00001-1`)

### Step 3: Expand RelationshipType in types/index.ts
Add: `Granddaughter`, `Grandson`, `Grandfather`, `Grandmother` to the `RelationshipType` union.

### Step 4: Handle N/A values globally
Treat `N/A`, `n/a`, `NA`, empty strings as null/undefined across all fields during import.

## Technical Details

- **Date parsing**: Use `parse(value, 'M/d/yy', new Date())` from date-fns with a reference date to handle 2-digit years correctly (77 → 1977, 04 → 2004)
- **Duplicate prevention**: Use `memberId` from file to check against existing members before creating
- **Batch size**: Process all 789 rows with `Promise.allSettled` (existing pattern)

## Files to Modify
1. `src/types/index.ts` — expand `RelationshipType`
2. `src/components/members/ImportMapperDialog.tsx` — add new field aliases and APP_FIELDS
3. `src/pages/Members.tsx` — fix import transformation logic

