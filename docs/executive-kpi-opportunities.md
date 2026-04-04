# Executive KPI Opportunities

This note is based on the current live Auto Aging snapshot on 2026-04-04.

## Current picture

- Active live vehicles: `997`
- Open stock: `875`
- Registered pending delivery: `519`
- Overdue KPI measurements: `456`
- Active quality issues: `827`

The current bottlenecks are already clear:

- `BG -> Shipment ETD`: `199` overdue measurements
- `Outlet Received -> Register Date`: `94` overdue measurements
- `Register Date -> Delivery`: `93` overdue measurements
- `30+ Days Open`: `537` units

## High-value KPI additions

These fields already exist in the uploaded source, so they are the best next KPI candidates:

### 1. Logistics and shipping performance

Available coverage from the active import:

- `shipment_name`: `2627 / 2667` raw rows
- Distinct shipment names: `123`

Recommended KPIs:

- `Shipment ETD accuracy by shipment_name`
- `Shipment ETA -> Outlet Received`
- `Average ETD slippage by shipment_name`
- `Open stock by shipment_name`

Why it matters:

- The current dataset already shows the biggest overdue lane at `BG -> Shipment ETD`, so carrier and vessel performance is a natural next drill-down.

### 2. Registration readiness and completion

Available coverage:

- `REG DATE`: `639 / 997` live vehicles
- `REG NO`: `1832 / 2667` raw rows
- `INVOICE NO`: `1718 / 2667` raw rows

Recommended KPIs:

- `Outlet Received -> Register Date` completion rate
- `Registration number completion rate`
- `Invoice completion rate`
- `Registered but not delivered backlog`

Why it matters:

- `519` units are already sitting in `Registered Pending Delivery`, so readiness and closure around that stage should become a first-class executive KPI set.

### 3. Finance readiness and disbursement health

Available coverage:

- `full_payment_date`: `1685 / 2667` raw rows
- `dealer_transfer_price`: `2665 / 2667` raw rows
- `delivery_to_disb` already works, but only `35` vehicles have valid measurements today

Recommended KPIs:

- `Full Payment -> Register Date`
- `Full Payment -> Delivery`
- `Full Payment -> Disbursement`
- `Delivered pending disbursement value`
- `Open stock value exposure`

Why it matters:

- You already have enough value and payment coverage to show both unit counts and money exposure, which is usually what management wants next after operational cycle times.

### 4. Approval / VAA pipeline

Available coverage:

- `vaa_date`: `2298 / 2667` raw rows

Recommended KPIs:

- `BG -> VAA`
- `VAA -> Shipment ETD`
- `VAA -> Delivery`
- `Units pending VAA`

Why it matters:

- This gives you an upstream leading indicator before the logistics bottleneck becomes visible downstream.

### 5. Data quality KPIs

Current quality signal:

- `827` active issues
- `988 / 997` live vehicles currently have no mapped `branch_id`

Recommended KPIs:

- `Unknown branch rate`
- `Missing milestone rate by field`
- `Negative duration rate by KPI`
- `Rows with invoice/reg mismatch`

Why it matters:

- Right now the dashboard can still tell the truth at a high level, but branch-level accountability is weak until branch mapping coverage improves.

## Recommended rollout order

1. `Registration readiness`
2. `Finance readiness and value exposure`
3. `Shipping performance by shipment_name`
4. `VAA upstream flow`
5. `Data quality governance KPIs`

## Product guidance

Not every KPI needs to be on the executive dashboard by default.

Recommended default board strategy:

- Keep the top board count-based and action-oriented
- Use customization for personal pinning
- Add deeper KPI families as presets and drill-down views
- Promote value-based KPIs only after the finance fields are fully normalized into the canonical model
