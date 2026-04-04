import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const templatesDir = path.join(rootDir, "public", "templates");

const columns = [
  { header: "CHASSIS NO.", required: "Yes", format: "Text", example: "PMK123456789", notes: "Unique vehicle chassis number." },
  { header: "BG DATE", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-01", notes: "Booking / BG date." },
  { header: "SHIPMENT ETD PKG", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-05", notes: "Shipment ETD from port or package." },
  { header: "DATE RECEIVED BY OUTLET", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-15", notes: "Outlet receipt date." },
  { header: "REG DATE", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-18", notes: "Registration date from the source system. Keep the column even if some rows are blank." },
  { header: "DELIVERY DATE", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-22", notes: "Vehicle delivery date." },
  { header: "DISB. DATE", required: "Yes", format: "YYYY-MM-DD", example: "2026-04-25", notes: "Disbursement date." },
  { header: "BRCH", required: "Yes", format: "Branch code", example: "KK", notes: "Must match an onboarded branch code." },
  { header: "MODEL", required: "Yes", format: "Text", example: "ATIVA", notes: "Vehicle model." },
  { header: "PAYMENT METHOD", required: "Yes", format: "Text", example: "Loan", notes: "Examples: Loan, Cash." },
  { header: "SA NAME", required: "No", format: "Text", example: "John Tan", notes: "Salesperson name." },
  { header: "CUST NAME", required: "No", format: "Text", example: "Alice Sdn Bhd", notes: "Customer name." },
  { header: "REMARKS", required: "No", format: "Text", example: "D2D transfer", notes: "Used to detect D2D / transfer rows." },
  { header: "VAA DATE", required: "No", format: "YYYY-MM-DD", example: "2026-04-09", notes: "Optional milestone." },
  { header: "FULL PAYMENT DATE", required: "No", format: "YYYY-MM-DD", example: "2026-04-21", notes: "Optional milestone." },
  { header: "NO.", required: "No", format: "Text/Number", example: "1", notes: "Source row number if available." },
  { header: "VARIANT", required: "No", format: "Text", example: "1.5 AV", notes: "Vehicle variant." },
  { header: "DTP (DEALER TRANSFER PRICE)", required: "No", format: "Text/Number", example: "68500", notes: "Dealer transfer price." },
  { header: "FULL PAYMENT TYPE", required: "No", format: "Text", example: "Bank", notes: "Optional finance detail." },
  { header: "SHIPMENT NAME", required: "No", format: "Text", example: "MV Sabah Express", notes: "Shipment identifier." },
  { header: "LOU", required: "No", format: "Text", example: "LOU-001", notes: "Optional logistics reference." },
  { header: "CONTRA SOLA", required: "No", format: "Text", example: "CS-001", notes: "Optional finance reference." },
  { header: "REG NO.", required: "No", format: "Text", example: "SAB1234A", notes: "Vehicle registration number." },
  { header: "INV NO.", required: "No", format: "Text", example: "INV-001", notes: "Invoice number." },
  { header: "OBR", required: "No", format: "Text", example: "OBR-001", notes: "Optional order / billing reference." },
];

const combineDataRows = [columns.map((column) => column.header)];
const referenceExampleRows = [
  columns.map((column) => column.example),
  [
    "PMK987654321",
    "2026-04-03",
    "2026-04-10",
    "2026-04-16",
    "2026-04-20",
    "",
    "",
    "MYY",
    "MYVI",
    "Cash",
    "Mary Lee",
    "Beta Ventures",
    "Awaiting delivery scheduling",
    "",
    "",
    "2",
    "1.3 G",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
];

const instructionsRows = [
  ["FLC BI Auto Aging Import Template"],
  ["Use the `Combine Data` sheet for uploads. Keep the headers exactly as provided."],
  ["The active process flow is BG -> ETD -> OUT -> REG -> DEL -> DISB."],
  ["Blank milestone dates are allowed for in-progress vehicles, but keep the required headers in place."],
  ["Future integrations can map SQL / Firebird exports into the same headers to avoid manual rework."],
  [],
  ["Header", "Required", "Accepted format", "Example", "Notes"],
  ...columns.map((column) => [column.header, column.required, column.format, column.example, column.notes]),
];

fs.mkdirSync(templatesDir, { recursive: true });

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(combineDataRows), "Combine Data");
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceExampleRows), "Reference Example");
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructionsRows), "Instructions");

XLSX.writeFile(workbook, path.join(templatesDir, "auto-aging-import-template.xlsx"));

const csvWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(csvWorkbook, XLSX.utils.aoa_to_sheet(combineDataRows), "Combine Data");
XLSX.writeFile(csvWorkbook, path.join(templatesDir, "auto-aging-import-template.csv"), { bookType: "csv" });

console.log("Generated import templates in public/templates");
