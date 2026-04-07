alter table app.import_jobs
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists error_message text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3;

alter table app.export_jobs
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3;
