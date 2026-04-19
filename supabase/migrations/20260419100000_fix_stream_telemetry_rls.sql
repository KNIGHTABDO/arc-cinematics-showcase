-- Fix stream_resolver_attempts RLS to allow telemetry inserts from the backend
drop policy if exists "No client access to stream_resolver_attempts" on public.stream_resolver_attempts;

-- Allow insert access for all paths (since it's an internal telemetry process using the anon key or authenticated app users)
-- We enforce security by disallowing 'select', 'update', and 'delete'
create policy "Allow telemetry inserts"
on public.stream_resolver_attempts
for insert
with check (true);

-- No read access 
create policy "No client select"
on public.stream_resolver_attempts
for select
using (false);
