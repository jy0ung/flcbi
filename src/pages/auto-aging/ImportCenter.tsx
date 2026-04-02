import React, { useState, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { parseWorkbook, publishCanonical } from '@/lib/import-parser';
import { ImportBatch, VehicleRaw } from '@/types';

type Step = 'upload' | 'validating' | 'review' | 'publishing' | 'done';

export default function ImportCenter() {
  const { addImportBatch, updateImportBatch, setVehicles, addQualityIssues, refreshKpis, vehicles } = useData();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<VehicleRaw[]>([]);
  const [validationIssues, setValidationIssues] = useState<{ id: string; chassisNo: string; field: string; issueType: string; message: string; severity: string; importBatchId: string }[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [batchId, setBatchId] = useState('');

  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('validating');

    const buffer = await file.arrayBuffer();
    const { rows, issues, missingColumns } = parseWorkbook(buffer);

    const id = `batch-${Date.now()}`;
    setBatchId(id);
    setRawRows(rows);
    setValidationIssues(issues);
    setMissingCols(missingColumns);

    const batch: ImportBatch = {
      id, fileName: file.name, uploadedBy: 'Current User', uploadedAt: new Date().toISOString(),
      status: missingColumns.length > 0 ? 'failed' : 'validated',
      totalRows: rows.length, validRows: rows.length - issues.filter(i => i.severity === 'error').length,
      errorRows: issues.filter(i => i.severity === 'error').length, duplicateRows: issues.filter(i => i.issueType === 'duplicate').length,
    };
    addImportBatch(batch);
    setStep('review');
  }, [addImportBatch]);

  const handlePublish = useCallback(() => {
    setStep('publishing');
    updateImportBatch(batchId, { status: 'publish_in_progress' });

    setTimeout(() => {
      const { canonical, issues } = publishCanonical(rawRows);
      setVehicles([...canonical, ...vehicles.filter(v => !canonical.find(c => c.chassis_no === v.chassis_no))]);
      addQualityIssues(issues);
      updateImportBatch(batchId, { status: 'published', publishedAt: new Date().toISOString() });
      refreshKpis();
      setStep('done');
    }, 1500);
  }, [batchId, rawRows, vehicles, updateImportBatch, setVehicles, addQualityIssues, refreshKpis]);

  const reset = () => { setStep('upload'); setRawRows([]); setValidationIssues([]); setMissingCols([]); };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Center"
        description="Upload and process vehicle data workbooks"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import Center' }]}
      />

      {/* Progress */}
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2">
          {(['upload', 'validating', 'review', 'publishing', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${step === s ? 'bg-primary/15 text-primary' : s < step ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                <span className="capitalize">{s}</span>
              </div>
              {i < 4 && <div className="flex-1 h-0.5 bg-border" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {step === 'upload' && (
        <div className="glass-panel p-12 text-center">
          <label className="cursor-pointer block">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileDrop} className="hidden" />
            <div className="border-2 border-dashed border-border rounded-lg p-12 hover:border-primary/50 transition-colors">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-foreground font-medium mb-1">Drop your workbook here or click to browse</p>
              <p className="text-sm text-muted-foreground">Supports .xlsx and .xls files with a "Combine Data" sheet</p>
            </div>
          </label>
        </div>
      )}

      {step === 'validating' && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium">Validating {fileName}...</p>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <p className="text-foreground font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{rawRows.length} rows parsed</p>
              </div>
            </div>

            {missingCols.length > 0 && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
                <p className="text-sm text-destructive font-medium">Missing required columns: {missingCols.join(', ')}</p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{rawRows.length}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-success">{rawRows.length - validationIssues.filter(i => i.severity === 'error').length}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{validationIssues.filter(i => i.severity === 'error').length}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-warning">{validationIssues.filter(i => i.issueType === 'duplicate').length}</p>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
            </div>

            {validationIssues.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
                {validationIssues.map(issue => (
                  <div key={issue.id} className="flex items-center gap-2 p-2 rounded bg-secondary/30 text-xs">
                    {issue.severity === 'error' ? <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />}
                    <span className="text-foreground">{issue.message}</span>
                    <StatusBadge status={issue.issueType} className="ml-auto" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handlePublish} disabled={missingCols.length > 0}>
                <CheckCircle className="h-4 w-4 mr-1" />Publish Canonical Data
              </Button>
              <Button variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {step === 'publishing' && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium">Publishing canonical data...</p>
          <p className="text-sm text-muted-foreground mt-1">Resolving duplicates, computing KPIs, and refreshing snapshots</p>
        </div>
      )}

      {step === 'done' && (
        <div className="glass-panel p-12 text-center">
          <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
          <p className="text-foreground font-semibold text-lg mb-1">Import Published Successfully</p>
          <p className="text-sm text-muted-foreground mb-6">Dashboard snapshots have been refreshed with the latest data.</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Import Another</Button>
            <Button variant="outline" onClick={() => window.location.href = '/auto-aging'}>View Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
