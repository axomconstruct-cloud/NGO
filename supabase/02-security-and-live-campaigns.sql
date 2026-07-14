-- Run after schema.sql. Safe to run more than once.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

create or replace function public.increment_cause_raised(cause_row_id bigint, increment_amount numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if increment_amount <= 0 then raise exception 'Invalid increment'; end if;
  update public.causes set raised = raised + increment_amount where id = cause_row_id;
end;
$$;
revoke all on function public.increment_cause_raised(bigint,numeric) from public, anon, authenticated;
grant execute on function public.increment_cause_raised(bigint,numeric) to service_role;

drop policy if exists "public_read_causes" on public.causes;
drop policy if exists "public_read_stories" on public.stories;
drop policy if exists "public_read_events" on public.events;
drop policy if exists "public_read_settings" on public.settings;
drop policy if exists "admin_causes" on public.causes;
drop policy if exists "admin_stories" on public.stories;
drop policy if exists "admin_events" on public.events;
drop policy if exists "admin_settings" on public.settings;
drop policy if exists "admin_donations" on public.donations;
drop policy if exists "admin_volunteers" on public.volunteers;
drop policy if exists "admin_contacts" on public.contacts;
drop policy if exists "admin_subscribers" on public.subscribers;

create policy "public_read_causes" on public.causes for select to anon, authenticated using (status='Active');
create policy "public_read_stories" on public.stories for select to anon, authenticated using (published=true);
create policy "public_read_events" on public.events for select to anon, authenticated using (published=true);
create policy "public_read_settings" on public.settings for select to anon, authenticated using (true);
create policy "admin_causes" on public.causes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_stories" on public.stories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_events" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_settings" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_donations" on public.donations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_volunteers" on public.volunteers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_contacts" on public.contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_subscribers" on public.subscribers for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_donations_status_cause on public.donations(status,cause_id);
create index if not exists idx_donations_paid_at on public.donations(paid_at desc);
create index if not exists idx_causes_status on public.causes(status);

drop policy if exists "public_read_news" on public.news;
drop policy if exists "admin_news" on public.news;
create policy "public_read_news" on public.news for select to anon, authenticated using (published=true);
create policy "admin_news" on public.news for all to authenticated using (public.is_admin()) with check (public.is_admin());
create index if not exists idx_news_published_at on public.news(published,published_at desc);
