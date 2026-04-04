# Main Dashboard KPI Approach

The executive dashboard should answer three questions in the first screen:

1. How much stock is still open?
2. Where is that stock getting stuck?
3. Which KPI lane is creating the most risk right now?

## KPI Groups

### 1. Live stock position
- Open stock: units without a `delivery_date`
- In transit: units with `shipment_etd_pkg` but no `date_received_by_outlet`
- At outlet: units with `date_received_by_outlet` but no `delivery_date`
- Delivered pending disbursement: units with `delivery_date` but no `disb_date`

### 2. Aging risk
- 30+ day open stock
- 60+ day open stock
- 90+ day open stock
- Open D2D transfers
- Pending shipment count

### 3. Data trust and operational health
- Total tracked units
- SLA breach count
- Quality issue count
- Import batch count
- Last refresh and latest published import

### 4. Bottleneck intelligence
- Branch comparison for BG to Delivery
- KPI watchlist sorted by overdue count
- Slowest vehicles and quality preview remain useful secondary drilldowns inside Auto Aging

## Why This Shape Works

- It separates stock position from process performance, so the dashboard is easier to read at a glance.
- It uses fields already present in the imported workbook, which keeps the KPI logic explainable.
- It supports both executives and operators: leaders see open stock risk, while teams can still drill into the process stage causing the slowdown.

## Data Rules

- `replace` publish mode is the default for full-snapshot uploads.
- `merge` publish mode stays available for exceptional incremental updates.
- Dashboard quality counts should come from the active dataset version(s), not historical imports, so repeat uploads do not inflate current-state issues.
