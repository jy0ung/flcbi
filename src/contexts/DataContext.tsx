import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { VehicleCanonical, ImportBatch, DataQualityIssue, SlaPolicy, KpiSummary } from '@/types';
import { demoVehicles, demoImportBatches, demoQualityIssues, demoSLAs, computeKpiSummaries } from '@/data/demo-data';

const STORAGE_KEYS = {
  vehicles: 'flc_bi_vehicles',
  importBatches: 'flc_bi_import_batches',
  qualityIssues: 'flc_bi_quality_issues',
} as const;

function loadFromStorage<T extends unknown[]>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as T;
    }
  } catch { /* ignore corrupt data */ }
  return fallback;
}

function saveToStorage(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* storage full — silent fail */ }
}

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
  const [vehicles, setVehiclesState] = useState<VehicleCanonical[]>(() => loadFromStorage(STORAGE_KEYS.vehicles, demoVehicles));
  const [importBatches, setImportBatches] = useState<ImportBatch[]>(() => loadFromStorage(STORAGE_KEYS.importBatches, demoImportBatches));
  const [qualityIssues, setQualityIssues] = useState<DataQualityIssue[]>(() => loadFromStorage(STORAGE_KEYS.qualityIssues, demoQualityIssues));
  const [slas, setSlas] = useState<SlaPolicy[]>(demoSLAs);
  const [kpiSummaries, setKpiSummaries] = useState<KpiSummary[]>(() => computeKpiSummaries(loadFromStorage(STORAGE_KEYS.vehicles, demoVehicles), demoSLAs));
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());

  // Persist to localStorage on changes
  useEffect(() => { saveToStorage(STORAGE_KEYS.vehicles, vehicles); }, [vehicles]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.importBatches, importBatches); }, [importBatches]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.qualityIssues, qualityIssues); }, [qualityIssues]);

  const setVehicles = useCallback((v: VehicleCanonical[]) => {
    setVehiclesState(v);
    setSlas(prev => {
      setKpiSummaries(computeKpiSummaries(v, prev));
      return prev;
    });
    setLastRefresh(new Date().toISOString());
  }, []);

  const addImportBatch = useCallback((b: ImportBatch) => setImportBatches(prev => [b, ...prev]), []);
  const updateImportBatch = useCallback((id: string, updates: Partial<ImportBatch>) => {
    setImportBatches(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);
  const addQualityIssues = useCallback((issues: DataQualityIssue[]) => setQualityIssues(prev => [...issues, ...prev]), []);
  const updateSla = useCallback((id: string, slaDays: number) => {
    setSlas(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, slaDays } : s);
      setKpiSummaries(prev2 => computeKpiSummaries(vehicles, updated));
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
