import React, { createContext, useContext, useState, useCallback } from 'react';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { demoVehicles, demoImportBatches, demoQualityIssues, demoSLAs, computeKpiSummaries } from '@/data/demo-data';

interface DataContextType {
  vehicles: VehicleCanonical[];
  importBatches: ImportBatch[];
  qualityIssues: DataQualityIssue[];
  slas: SlaPolicy[];
  kpiSummaries: KpiSummary[];
  lastRefresh: string;
  setVehicles: (v: VehicleCanonical[]) => void;
  addImportBatch: (b: ImportBatch) => void;
  updateImportBatch: (id: string, updates: Partial<ImportBatch>) => void;
  addQualityIssues: (issues: DataQualityIssue[]) => void;
  updateSla: (id: string, slaDays: number) => void;
  refreshKpis: () => void;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [vehicles, setVehicles] = useState<VehicleCanonical[]>(demoVehicles);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>(demoImportBatches);
  const [qualityIssues, setQualityIssues] = useState<DataQualityIssue[]>(demoQualityIssues);
  const [slas, setSlas] = useState<SlaPolicy[]>(demoSLAs);
  const [kpiSummaries, setKpiSummaries] = useState<KpiSummary[]>(() => computeKpiSummaries(demoVehicles, demoSLAs));
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());

  const addImportBatch = useCallback((b: ImportBatch) => setImportBatches(prev => [b, ...prev]), []);
  const updateImportBatch = useCallback((id: string, updates: Partial<ImportBatch>) => {
    setImportBatches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);
  const addQualityIssues = useCallback((issues: DataQualityIssue[]) => setQualityIssues(prev => [...issues, ...prev]), []);
  const updateSla = useCallback((id: string, slaDays: number) => {
    setSlas(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, slaDays } : s);
      setKpiSummaries(computeKpiSummaries(vehicles, updated));
      return updated;
    });
  }, [vehicles]);
  const refreshKpis = useCallback(() => {
    setKpiSummaries(computeKpiSummaries(vehicles, slas));
    setLastRefresh(new Date().toISOString());
  }, [vehicles, slas]);

  return (
    <DataContext.Provider value={{ vehicles, importBatches, qualityIssues, slas, kpiSummaries, lastRefresh, setVehicles, addImportBatch, updateImportBatch, addQualityIssues, updateSla, refreshKpis }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
