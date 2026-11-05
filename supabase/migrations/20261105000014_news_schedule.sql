-- Noticias: la tarea programada que llama a news-sync una vez por hora, en el minuto 7.
-- Solo corre donde existen pg_cron, pg_net y Vault (Supabase). El secreto se genera aquí
-- y vive únicamente en Vault.
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;

  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;

  if not exists (select 1 from vault.secrets where name = 'news_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'news_cron_secret');
  end if;
  if not exists (select 1 from vault.secrets where name = 'news_sync_url') then
    perform vault.create_secret('https://ttwkkzglmslqtojzxekf.supabase.co/functions/v1/news-sync', 'news_sync_url');
  end if;

  perform cron.schedule(
    'news-sync',
    '7 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'news_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
    $job$
  );
end;
$do$;
