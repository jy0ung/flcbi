import React, { createContext, useContext } from 'react';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoAgingData } from '@/modules/auto-aging/hooks/useAutoAgingData';

interface DataContextType {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
  kpiSummaries: KpiSummary[];
  lastRefresh: string;
  loading: boolean;
  setVehicles: (v: VehicleCanonical[]) => void;
  addImportBatch: (b: ImportBatch) => void;
  updateImportBatch: (id: string, updates: Partial<ImportBatch>) => void;
  addQualityIssues: (issues: DataQualityIssue[]) => void;
  updateSla: (id: string, slaDays: number) => void;
  refreshKpis: () => void;
  reloadFromDb: () => Promise<void>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const companyId = user?.company_id || 'c1';
  const data = useAutoAgingData({ companyId });

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
