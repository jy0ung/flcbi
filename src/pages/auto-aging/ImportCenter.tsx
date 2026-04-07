import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { useCreateImport, useImport, usePublishImport } from '@/hooks/api/use-platform';
import type { DataQualityIssue, ImportBatch, ImportPublishMode } from '@flcbi/contracts';

type Step = 'upload' | 'validating' | 'review' | 'publishing' | 'done';

function isImportPending(status?: ImportBatch['status']) {
  return status === 'uploaded' || status === 'validating' || status === 'normalization_in_progress' || status === 'publish_in_progress';
}

const publishModeOptions: Array<{
  value: ImportPublishMode;
  title: string;
  description: string;
}> = [
  {
    value: 'replace',
    title: 'Replace Current Dataset',
    description: 'Recommended for full-file uploads. Rows missing from the new file are removed from the live snapshot.',
  },
  {
    value: 'merge',
    title: 'Merge Into Current Dataset',
    description: 'Only updates matching chassis and adds new rows. Existing rows not present in the new file stay live.',
  },
];

export default function ImportCenter() {
  const queryClient = useQueryClient();
  const createImport = useCreateImport();
  const publishImport = usePublishImport();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{ item: ImportBatch; previewIssues: DataQualityIssue[]; missingColumns: string[]; previewRows: number } | null>(null);
  const [validationIssues, setValidationIssues] = useState<DataQualityIssue[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [batchId, setBatchId] = useState('');
  const [error, setError] = useState('');
  const [autoPublishAttempted, setAutoPublishAttempted] = useState(false);
  const [publishMode, setPublishMode] = useState<ImportPublishMode>('replace');
  const [awaitingValidation, setAwaitingValidation] = useState(false);
  const autoPublishImportIdRef = useRef<string | null>(null);
  const publishedImportIdRef = useRef<string | null>(null);
  const polledImport = useImport(batchId, awaitingValidation);

  const publishValidatedImport = useCallback((detail: { item: ImportBatch }) => {
    if (autoPublishImportIdRef.current === detail.item.id) {
      return;
    }

    autoPublishImportIdRef.current = detail.item.id;
    setAutoPublishAttempted(true);
    setStep('publishing');
    setError('');
    void publishImport.mutateAsync({ id: detail.item.id, mode: publishMode }).then((published) => {
      setPreview((currentPreview) => currentPreview ? { ...currentPreview, item: published.item } : currentPreview);
      const stillPending = isImportPending(published.item.status);
      setAwaitingValidation(stillPending);
      setStep(published.item.status === 'published' ? 'done' : 'publishing');
    }).catch((mutationError) => {
      setAwaitingValidation(false);
      setStep('review');
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to publish import');
    });
  }, [publishImport, publishMode]);

  const applyImportDetail = useCallback((detail: { item: ImportBatch; previewIssues: DataQualityIssue[]; missingColumns: string[]; previewRows: number }) => {
    setPreview(detail);
    setBatchId(detail.item.id);
    setValidationIssues(detail.previewIssues);
    setMissingCols(detail.missingColumns);

    if (detail.item.status === 'publish_in_progress') {
      setAwaitingValidation(true);
      setStep('publishing');
      return;
    }

    if (isImportPending(detail.item.status)) {
      setAwaitingValidation(true);
      setStep('validating');
      return;
    }

    setAwaitingValidation(false);
    if (detail.item.status === 'failed') {
      if (!detail.item.previewAvailable && detail.previewIssues.length === 0 && detail.missingColumns.length === 0) {
        setError('The worker could not finish validating this workbook. Please retry the upload.');
      }
      setStep('review');
      return;
    }

    if (detail.item.status === 'published') {
      setError('');
      setStep('done');
      return;
    }

    if (detail.missingColumns.length > 0) {
      setStep('review');
      return;
    }

    setError('');
    publishValidatedImport(detail);
  }, [publishValidatedImport]);

  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setFileName(file.name);
    setStep('validating');
    setPreview(null);
    setValidationIssues([]);
    setMissingCols([]);
    setBatchId('');
    setAwaitingValidation(false);
    setAutoPublishAttempted(false);
    autoPublishImportIdRef.current = null;
    publishedImportIdRef.current = null;
    try {
      const response = await createImport.mutateAsync(file);
      applyImportDetail(response);
    } catch (mutationError) {
      setAwaitingValidation(false);
      setStep('upload');
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to process workbook');
    }
  }, [applyImportDetail, createImport]);

  useEffect(() => {
    if (!polledImport.data) {
      return;
    }

    applyImportDetail(polledImport.data);
  }, [applyImportDetail, polledImport.data]);

  useEffect(() => {
    if (!awaitingValidation || !polledImport.error) {
      return;
    }

    setAwaitingValidation(false);
    setStep(step === 'publishing' ? 'review' : 'upload');
    setError(polledImport.error instanceof Error ? polledImport.error.message : 'Failed to refresh import validation status');
  }, [awaitingValidation, polledImport.error, step]);

  const handlePublish = useCallback(() => {
    setStep('publishing');
    setError('');
    void publishImport.mutateAsync({ id: batchId, mode: publishMode }).then((published) => {
      setPreview((currentPreview) => currentPreview ? { ...currentPreview, item: published.item } : currentPreview);
      const stillPending = isImportPending(published.item.status);
      setAwaitingValidation(stillPending);
      setStep(published.item.status === 'published' ? 'done' : 'publishing');
    }).catch((mutationError) => {
      setStep('review');
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to publish import');
    });
  }, [batchId, publishImport, publishMode]);

  const reset = () => {
    setStep('upload');
    setPreview(null);
    setValidationIssues([]);
    setMissingCols([]);
    setFileName('');
    setError('');
    setBatchId('');
    setAwaitingValidation(false);
    setAutoPublishAttempted(false);
    setPublishMode('replace');
    autoPublishImportIdRef.current = null;
    publishedImportIdRef.current = null;
  };

  useEffect(() => {
    if (preview?.item.status !== 'published' || publishedImportIdRef.current === preview.item.id) {
      return;
    }

    publishedImportIdRef.current = preview.item.id;
    void queryClient.invalidateQueries({ queryKey: ['imports'] });
    void queryClient.invalidateQueries({ queryKey: ['aging', 'summary'] });
    void queryClient.invalidateQueries({ queryKey: ['aging', 'quality'] });
    void queryClient.invalidateQueries({ queryKey: ['aging', 'explorer'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [preview?.item.id, preview?.item.status, queryClient]);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Import Center"
        description="Upload and process vehicle data workbooks"
        breadcrumbs={[{ label: 'FLC BI' }, { label: 'Auto Aging' }, { label: 'Import Center' }]}
        actions={(
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/templates/auto-aging-import-template.xlsx', '_blank', 'noopener,noreferrer')}
            >
              <Download className="h-3.5 w-3.5 mr-1" />Download Template
            </Button>
          </div>
        )}
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

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <div className="glass-panel p-5">
            <div className="mb-4">
              <p className="text-sm font-medium text-foreground">Publish Mode</p>
              <p className="text-xs text-muted-foreground mt-1">
                Choose how the uploaded workbook should affect the live dataset after validation.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {publishModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPublishMode(option.value)}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    publishMode === option.value
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-secondary/20 hover:border-primary/40'
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{option.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel p-12 text-center">
            <label className="cursor-pointer block">
              <input type="file" accept=".xlsx,.xls" onChange={handleFileDrop} className="hidden" />
              <div className="border-2 border-dashed border-border rounded-lg p-12 hover:border-primary/50 transition-colors">
                <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-foreground font-medium mb-1">Drop your workbook here or click to browse</p>
                <p className="text-sm text-muted-foreground">Supports .xlsx and .xls files with a "Combine Data" sheet</p>
                <p className="text-xs text-muted-foreground mt-3">
                  Valid files are normalized and published automatically using <span className="font-medium text-foreground">{publishMode}</span> mode.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start from the downloadable template if you want the workbook headers to match the current
                  {' '}<span className="font-medium text-foreground">BG - ETD - OUT - REG - DEL - DISB</span>{' '}
                  schema.
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {step === 'validating' && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-foreground font-medium">
            {preview?.item.status === 'uploaded' ? `Queued ${fileName} for validation...` : `Validating ${fileName}...`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {preview?.item.status === 'uploaded'
              ? 'The worker is downloading and parsing the workbook in the background.'
              : 'Checking workbook headers, normalizing rows, and preparing the preview.'}
          </p>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-3 mb-4">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-foreground font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{preview?.previewRows ?? 0} rows parsed</p>
                </div>
              </div>

            {autoPublishAttempted && missingCols.length === 0 && (
              <div className="p-3 rounded-md bg-warning/10 border border-warning/20 mb-4">
                <p className="text-sm text-warning font-medium">Automatic publish stopped and needs your review.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  The upload validated successfully, but publish could not complete automatically. You can retry below.
                </p>
              </div>
            )}

            {missingCols.length > 0 && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
                <p className="text-sm text-destructive font-medium">Missing required columns: {missingCols.join(', ')}</p>
              </div>
            )}

            {preview?.item.status === 'failed' && missingCols.length === 0 && validationIssues.length === 0 && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-4">
                <p className="text-sm text-destructive font-medium">Validation could not complete for this workbook.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {preview.item.errorMessage ?? 'The worker stopped before a preview could be prepared. Retry the upload after checking the file.'}
                </p>
                {preview.item.attemptCount != null && preview.item.maxAttempts != null && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Attempts: {preview.item.attemptCount}/{preview.item.maxAttempts}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{preview?.item.totalRows ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-success">{preview?.item.validRows ?? 0}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{preview?.item.errorRows ?? 0}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-warning">{preview?.item.duplicateRows ?? 0}</p>
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

            <div className="rounded-md border border-border bg-secondary/20 p-3 mb-4">
              <p className="text-sm font-medium text-foreground mb-2">Publish Mode</p>
              <div className="grid gap-2 md:grid-cols-2">
                {publishModeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPublishMode(option.value)}
                    className={`rounded-md border p-3 text-left transition-colors ${
                      publishMode === option.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/40'
                    }`}
                  >
                    <p className="text-xs font-medium text-foreground">{option.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handlePublish}
                disabled={
                  missingCols.length > 0
                  || !preview
                  || (!preview.item.previewAvailable && preview.item.status === 'failed')
                  || isImportPending(preview.item.status)
                }
              >
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
          <p className="text-foreground font-medium">
            {autoPublishAttempted ? 'Normalizing and publishing data...' : 'Publishing canonical data...'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Resolving duplicates, computing KPIs, and refreshing snapshots using {publishMode} mode
          </p>
          {preview?.item.attemptCount != null && preview?.item.maxAttempts != null && preview.item.attemptCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Attempt {preview.item.attemptCount} of {preview.item.maxAttempts}
            </p>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="glass-panel p-12 text-center space-y-6">
          <div>
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
            <p className="text-foreground font-semibold text-lg mb-1">Import Published Successfully</p>
            <p className="text-sm text-muted-foreground">
              Dashboard snapshots have been refreshed with the latest data using {preview?.item.publishMode ?? publishMode} mode.
            </p>
          </div>

          {preview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-foreground">{preview.item.totalRows}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-success">{preview.item.validRows}</p>
                <p className="text-xs text-muted-foreground">Valid</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-destructive">{preview.item.errorRows}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <div className="p-3 rounded bg-secondary/50 text-center">
                <p className="text-2xl font-bold text-warning">{preview.item.duplicateRows}</p>
                <p className="text-xs text-muted-foreground">Duplicates</p>
              </div>
            </div>
          )}

          {validationIssues.length > 0 && (
            <div className="space-y-2 text-left">
              <p className="text-sm font-medium text-foreground">Validation notes</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {validationIssues.map(issue => (
                  <div key={issue.id} className="flex items-center gap-2 p-2 rounded bg-secondary/30 text-xs">
                    {issue.severity === 'error' ? <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" /> : <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />}
                    <span className="text-foreground">{issue.message}</span>
                    <StatusBadge status={issue.issueType} className="ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-center">
            <Button onClick={reset}>Import Another</Button>
            <Button variant="outline" onClick={() => window.location.href = '/auto-aging'}>View Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
