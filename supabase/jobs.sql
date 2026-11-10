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
-- 20 stocks every 3 minutes; each stock refreshes once its data is 7+ days old.
select cron.schedule('screener-fundamentals', '*/3 * * * *',    $$select public.scr_run('fundamentals')$$);
-- Price history for new listings (idle once everything is loaded).
select cron.schedule('screener-backfill',     '1-59/3 * * * *', $$select public.scr_run('backfill')$$);
-- Rebuild scores, technicals and scorecard rows (no FMP calls).
select cron.schedule('screener-score',        '50 * * * *',     $$select public.scr_run('score')$$);

-- Turn the SEC filing reader on (SEC requires a name + real contact email):
-- select vault.create_secret('LifeLedgerScreener you@example.com', 'sec_user_agent');
