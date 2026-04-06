alter table if exists app.import_jobs
  add column if not exists missing_columns text[] not null default '{}'::text[];
