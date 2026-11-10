-- Stock screener tables. They live in the Life Ledger Supabase project (shared login).
-- Market data is readable by any signed-in user and written only by the screener-sync function.

create table if not exists public.scr_stocks (
  symbol text primary key,
  name text,
  sector text,
  industry text,
  exchange text,
  market_cap numeric,
  price numeric,
  beta numeric,
  active boolean not null default true,
  price_at timestamptz,
  fundamentals_at timestamptz,          -- last full FMP pull (rotates weekly)
  metrics jsonb,                        -- everything buildMetrics() returns
  card jsonb,                           -- compact row for the scorecard table (metrics + technicals + scores)
  scored_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists scr_stocks_fund_idx on public.scr_stocks (active, fundamentals_at nulls first);

create table if not exists public.scr_prices (
  symbol text primary key references public.scr_stocks(symbol) on delete cascade,
  dates date[] not null default '{}',
  closes double precision[] not null default '{}',
  backfilled_at timestamptz
);

-- Cache of what each SEC prospectus is selling (read once, kept).
create table if not exists public.scr_filings (
  link text primary key,
  symbol text not null,
  form text,
  filed date,
  kind text,          -- equity | convert | atm | debt | unknown
  note text,
  read_at timestamptz not null default now()
);
create index if not exists scr_filings_symbol_idx on public.scr_filings (symbol);

-- Per-user: moat overrides and rule changes.
create table if not exists public.scr_overrides (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  symbol text not null,
  moat smallint check (moat between 1 and 10),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
create table if not exists public.scr_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  rules jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.scr_runs (
  id bigserial primary key,
  task text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  calls int,
  detail jsonb
);

alter table public.scr_stocks enable row level security;
alter table public.scr_prices enable row level security;
alter table public.scr_filings enable row level security;
alter table public.scr_overrides enable row level security;
alter table public.scr_user_settings enable row level security;
alter table public.scr_runs enable row level security;

drop policy if exists "read stocks" on public.scr_stocks;
create policy "read stocks" on public.scr_stocks for select to authenticated using (true);
drop policy if exists "read prices" on public.scr_prices;
create policy "read prices" on public.scr_prices for select to authenticated using (true);
drop policy if exists "read filings" on public.scr_filings;
create policy "read filings" on public.scr_filings for select to authenticated using (true);
drop policy if exists "read runs" on public.scr_runs;
create policy "read runs" on public.scr_runs for select to authenticated using (true);
drop policy if exists "own overrides" on public.scr_overrides;
create policy "own overrides" on public.scr_overrides for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own screener settings" on public.scr_user_settings;
create policy "own screener settings" on public.scr_user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Appends one day's closes for many symbols at once: rows = [{symbol, date, close}, ...].
-- Replaces the last value if the date is already there; keeps the newest 600 trading days.
create or replace function public.scr_append_closes(rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; d date; c double precision;
begin
  for r in select * from jsonb_array_elements(rows) loop
    d := (r->>'date')::date; c := (r->>'close')::double precision;
    update scr_prices p set
      dates  = case when p.dates[array_length(p.dates,1)] = d then p.dates else (p.dates || d) end,
      closes = case when p.dates[array_length(p.dates,1)] = d
                    then p.closes[1:array_length(p.closes,1)-1] || c else (p.closes || c) end
    where p.symbol = r->>'symbol' and p.backfilled_at is not null
      and (array_length(p.dates,1) is null or p.dates[array_length(p.dates,1)] <= d);
    if found then n := n + 1; end if;
  end loop;
  update scr_prices set dates = dates[array_length(dates,1)-599:], closes = closes[array_length(closes,1)-599:]
    where array_length(dates,1) > 600;
  return n;
end $$;
revoke all on function public.scr_append_closes(jsonb) from public, anon, authenticated;
grant execute on function public.scr_append_closes(jsonb) to service_role;

-- Secrets (FMP key, job token) live encrypted in Supabase Vault; only the service role can read them.
create or replace function public.scr_secret(secret_name text)
returns text language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1
$$;
revoke all on function public.scr_secret(text) from public, anon, authenticated;
grant execute on function public.scr_secret(text) to service_role;

-- AI impact scores (risk and benefit, 1-10, with reasons). Written by Claude in chat on request;
-- readable by any signed-in user, written only with the service role.
create table if not exists public.scr_ai (
  symbol text primary key,
  risk smallint not null check (risk between 1 and 10),
  benefit smallint not null check (benefit between 1 and 10),
  risk_reasons text[] not null default '{}',
  benefit_reasons text[] not null default '{}',
  summary text,
  rated_at timestamptz not null default now(),
  rated_by text not null default 'Claude (in chat)'
);
alter table public.scr_ai enable row level security;
create policy "read ai" on public.scr_ai for select to authenticated using (true);
