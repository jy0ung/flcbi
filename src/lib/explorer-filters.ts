import type { ExplorerColumnFilterValue, ExplorerFilterSet } from "@flcbi/contracts";

export type ExplorerSimpleField = "search" | "branch" | "model" | "payment" | "preset";
export type ExplorerFilterTextKey = "chassisNo" | "salesmanName" | "customerName" | "remark";
export type ExplorerFilterDateKey = "bgDate" | "shipmentEtdPkg" | "dateReceivedByOutlet" | "regDate" | "deliveryDate" | "disbDate";
export type ExplorerFilterNumberKey =
  | "bgToDelivery"
  | "bgToShipmentEtd"
  | "etdToOutletReceived"
  | "outletReceivedToReg"
  | "regToDelivery"
  | "bgToDisb"
  | "deliveryToDisb";

export interface ExplorerFilterApi {
  updateSimpleField: (field: ExplorerSimpleField, value: string | undefined) => void;
  updateTextFilter: (field: ExplorerFilterTextKey, value: string) => void;
  updateBooleanFilter: (value: string) => void;
  updateDateRangeFilter: (field: ExplorerFilterDateKey, value: { from?: string; to?: string }) => void;
  updateNumberRangeFilter: (field: ExplorerFilterNumberKey, value: { min?: string; max?: string }) => void;
  updateColumnFilter: (field: string, value: ExplorerColumnFilterValue | undefined) => void;
  clearAllFilters: () => void;
}

export function isExplorerFilterSet(value: unknown): value is ExplorerFilterSet {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
