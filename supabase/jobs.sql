-- Scheduled jobs for the screener (already applied to the Life Ledger project).
-- Secrets live in Supabase Vault: fmp_api_key, screener_job_token, and optionally sec_user_agent.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Starts one screener-sync task (the function runs it in the background).
create or replace function public.scr_run(task text, extra text default '')
returns bigint language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := 'https://vwgckbpdtqwkxnogbjtq.supabase.co/functions/v1/screener-sync?task=' || task || extra,
    headers := jsonb_build_object('Content-Type','application/json','x-job-token', public.scr_secret('screener_job_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$;
revoke all on function public.scr_run(text, text) from public, anon, authenticated;

-- Times are UTC. 22:15 UTC = 5:15pm New York in winter (6:15pm in summer), after the close.
select cron.schedule('screener-universe',     '15 22 * * 1-5',  $$select public.scr_run('universe')$$);
-- 25 stocks every 2 minutes (300 FMP calls); each stock refreshes once its data is 7+ days old.
select cron.schedule('screener-fundamentals', '*/2 * * * *',    $$select public.scr_run('fundamentals', '&limit=25&rate=150')$$);
-- Price history for new listings (idle once everything is loaded).
select cron.schedule('screener-backfill',     '1-59/3 * * * *', $$select public.scr_run('backfill')$$);
-- Rebuild scores, technicals and scorecard rows (no FMP calls).
select cron.schedule('screener-score',        '50 * * * *',     $$select public.scr_run('score')$$);

-- Turn the SEC filing reader on (SEC requires a name + real contact email):
-- select vault.create_secret('LifeLedgerScreener you@example.com', 'sec_user_agent');
-- Backtest data and the 10-year moat: 12 years of annual reports + weekly prices per stock (refreshed monthly), then the replay.
-- Steady state: 8 stocks every 2 minutes (odd minutes) at 60 calls/min, beside fundamentals (150/min): under FMP's 300/min.
select cron.schedule('screener-history', '1-59/2 * * * *', $$select public.scr_run('history', '&limit=8&rate=60')$$);
select cron.schedule('screener-replay',  '*/5 * * * *',    $$select public.scr_run('replay', '&limit=250')$$);
-- Full (re)load of history: pause fundamentals, run history alone at 40 stocks/2 min, rate 240, and let a handoff
-- job switch back to the steady state when scr_history_todo(1) is empty (see the 2026-11-13 load):
--   select cron.alter_job((select jobid from cron.job where jobname='screener-fundamentals'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname='screener-history'), schedule := '*/2 * * * *',
--     command := $x$select public.scr_run('history', '&limit=40&rate=240')$x$);
--   update scr_history set fetched_at = null where symbol <> 'SPY';
--   select cron.schedule('screener-handoff', '*/10 * * * *', $h$ do $b$ begin
--     if not exists (select 1 from public.scr_history_todo(1)) then
--       perform cron.alter_job((select jobid from cron.job where jobname = 'screener-fundamentals'), active := true);
--       perform cron.alter_job((select jobid from cron.job where jobname = 'screener-history'), schedule := '1-59/2 * * * *',
--         command := $x$select public.scr_run('history', '&limit=8&rate=60')$x$);
--       perform cron.unschedule('screener-handoff');
--     end if; end $b$; $h$);
