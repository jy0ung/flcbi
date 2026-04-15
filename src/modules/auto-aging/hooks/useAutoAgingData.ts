import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeKpiSummaries } from '@/data/demo-data';
import { DataQualityIssue, ImportBatch, KpiSummary, SlaPolicy, VehicleCanonical } from '@/types';
import {
  fetchAutoAgingSnapshot,
  insertImportBatch,
  insertQualityIssues,
  patchImportBatch,
  patchSla,
  upsertVehicles,
} from '@/modules/auto-aging/services/repository';

interface UseAutoAgingDataArgs {
  companyId: string;
}

export function useAutoAgingData({ companyId }: UseAutoAgingDataArgs) {
  const [vehicles, setVehiclesState] = useState<VehicleCanonical[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [qualityIssues, setQualityIssues] = useState<DataQualityIssue[]>([]);
  const [slas, setSlas] = useState<SlaPolicy[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date().toISOString());
  const [loading, setLoading] = useState(true);

  const reloadFromDb = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await fetchAutoAgingSnapshot();
      setVehiclesState(snapshot.vehicles);
      setImportBatches(snapshot.importBatches);
      setQualityIssues(snapshot.qualityIssues);
      setSlas(snapshot.slas);
      setLastRefresh(new Date().toISOString());
    } catch (err) {
      console.error('Failed to load auto aging snapshot:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadFromDb();
  }, [reloadFromDb]);

  const setVehicles = useCallback(async (vehicles: VehicleCanonical[]) => {
    await upsertVehicles(vehicles, companyId);
    await reloadFromDb();
  }, [companyId, reloadFromDb]);

  const addImportBatch = useCallback(async (batch: ImportBatch) => {
    await insertImportBatch(batch, companyId);
    setImportBatches(prev => [batch, ...prev]);
  }, [companyId]);

  const updateImportBatch = useCallback(async (id: string, updates: Partial<ImportBatch>) => {
    await patchImportBatch(id, updates);
    setImportBatches(prev => prev.map(batch => batch.id === id ? { ...batch, ...updates } : batch));
  }, []);

  const addQualityIssues = useCallback(async (issues: DataQualityIssue[]) => {
    await insertQualityIssues(issues, companyId);
    setQualityIssues(prev => [...issues, ...prev]);
  }, [companyId]);

  const updateSla = useCallback(async (id: string, slaDays: number) => {
    await patchSla(id, slaDays);
    setSlas(prev => prev.map(sla => sla.id === id ? { ...sla, slaDays } : sla));
  }, []);

  const kpiSummaries: KpiSummary[] = useMemo(() => computeKpiSummaries(vehicles, slas), [vehicles, slas]);

  const refreshKpis = useCallback(() => {
    setLastRefresh(new Date().toISOString());
  }, []);

  return {
    vehicles,
    importBatches,
    qualityIssues,
    slas,
    kpiSummaries,
    lastRefresh,
    loading,
    setVehicles,
    addImportBatch,
    updateImportBatch,
    addQualityIssues,
    updateSla,
    refreshKpis,
    reloadFromDb,
  };
}
