import type {
  CreateExplorerExportRequest,
  CreateExportSubscriptionRequest,
  ExplorerQuery,
  ExportSubscription,
} from "@flcbi/contracts";

export class CreateExplorerExportDto implements CreateExplorerExportRequest {
  query!: ExplorerQuery;
}

export class CreateExportSubscriptionDto implements CreateExportSubscriptionRequest {
  query!: ExplorerQuery;
  schedule?: ExportSubscription["schedule"];
}
