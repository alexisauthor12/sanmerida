create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  full_name text,
  phone text,
  role text not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Profiles are readable by authenticated users"
on public.profiles
for select
using (auth.role() = 'authenticated');

create policy "Profiles are insertable by authenticated users"
on public.profiles
for insert
with check (auth.role() = 'authenticated');

create policy "Profiles are updatable by authenticated users"
on public.profiles
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
