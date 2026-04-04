alter table if exists app.import_jobs
  add column if not exists publish_mode text;

alter table if exists app.import_jobs
  drop constraint if exists import_jobs_publish_mode_check;

alter table if exists app.import_jobs
  add constraint import_jobs_publish_mode_check
  check (publish_mode is null or publish_mode in ('replace', 'merge'));

update app.import_jobs
set publish_mode = 'merge'
where published_at is not null
  and publish_mode is null;
