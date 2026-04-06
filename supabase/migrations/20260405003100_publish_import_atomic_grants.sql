do $$
begin
  revoke all on function app.publish_import_atomic(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb) from public;
  grant execute on function app.publish_import_atomic(uuid, uuid, uuid, timestamptz, text, jsonb, jsonb) to service_role;
end;
$$;
