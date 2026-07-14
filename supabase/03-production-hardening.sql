-- Run after schema.sql and 02-security-and-live-campaigns.sql. Safe to rerun.
alter table public.causes add column if not exists updated_at timestamptz default now();
alter table public.stories add column if not exists updated_at timestamptz default now();
alter table public.events add column if not exists updated_at timestamptz default now();
alter table public.news add column if not exists updated_at timestamptz default now();
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='causes_updated_at') then create trigger causes_updated_at before update on public.causes for each row execute function public.set_updated_at(); end if;
 if not exists(select 1 from pg_trigger where tgname='stories_updated_at') then create trigger stories_updated_at before update on public.stories for each row execute function public.set_updated_at(); end if;
 if not exists(select 1 from pg_trigger where tgname='events_updated_at') then create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at(); end if;
 if not exists(select 1 from pg_trigger where tgname='news_updated_at') then create trigger news_updated_at before update on public.news for each row execute function public.set_updated_at(); end if;
end $$;
create unique index if not exists donations_successful_payment_unique on public.donations(razorpay_payment_id) where razorpay_payment_id is not null;
create index if not exists events_public_date_idx on public.events(published,event_date);
create index if not exists volunteers_created_idx on public.volunteers(created_at desc);
create index if not exists contacts_created_idx on public.contacts(created_at desc);
