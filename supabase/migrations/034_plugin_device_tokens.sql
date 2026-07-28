-- Per-user credentials for the Figma plugin, replacing the shared
-- HEIMDALL_PLUGIN_SECRET for new (localization) routes.
--
-- Why: the shared secret is injected into the plugin bundle at build time
-- (esbuild --define), so anyone holding code.js has it. That is tolerable for
-- the existing org-private flows, but it should not gain new write routes.
-- These tables back a device-pairing flow (RFC 8628 shape): the plugin shows a
-- short code, the user approves it in a browser where they are already signed
-- in, and the plugin receives a token bound to that user — revocable
-- individually and never baked into a bundle.
--
-- Both tables are service-role only. Nothing here is readable with an end-user
-- JWT: the plugin has no Supabase session, and the token hash must never be
-- selectable by a client.

-- Short-lived handshake rows. One per "connect" attempt; consumed on issue.
create table if not exists plugin_pairings (
  id                uuid primary key default gen_random_uuid(),
  -- Hashes only. The plaintext device code lives in the plugin's memory and
  -- the user code is shown on screen; neither is recoverable from the DB.
  device_code_hash  text not null unique,
  -- Short, human-typeable (e.g. "K7QP-3T9M"). Unique among live rows.
  user_code         text not null unique,
  -- Null until a signed-in human approves the code in the browser.
  user_id           uuid references auth.users(id) on delete cascade,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'issued')),
  -- Free-text hint shown on the approval screen ("Figma · Test Plugin"), so
  -- the approver can tell what they are authorising.
  client_label      text,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  approved_at       timestamptz,
  issued_at         timestamptz
);

create index if not exists idx_plugin_pairings_user_code on plugin_pairings(user_code);
create index if not exists idx_plugin_pairings_expires on plugin_pairings(expires_at);

-- Long-lived per-user bearer tokens the plugin sends as Authorization: Bearer.
create table if not exists plugin_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- SHA-256 of the token. The plaintext is returned exactly once, at issue.
  token_hash        text not null unique,
  -- Last 6 chars of the plaintext, so a user can recognise which token is
  -- which in a list without the value being reconstructable.
  token_hint        text,
  label             text,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  expires_at        timestamptz,
  revoked_at        timestamptz
);

create index if not exists idx_plugin_tokens_hash on plugin_tokens(token_hash);
create index if not exists idx_plugin_tokens_user on plugin_tokens(user_id, created_at desc);

alter table plugin_pairings enable row level security;
alter table plugin_tokens enable row level security;

-- Service-role only: these are resolved server-side in route handlers. No
-- end-user policy exists on purpose — a client that could select token_hash
-- could impersonate every paired plugin.
create policy "service_role_plugin_pairings" on plugin_pairings
  for all using (auth.role() = 'service_role');

create policy "service_role_plugin_tokens" on plugin_tokens
  for all using (auth.role() = 'service_role');

comment on table plugin_pairings is
  'Device-pairing handshakes for the Figma plugin. Rows are short-lived and consumed when a token is issued.';
comment on table plugin_tokens is
  'Per-user bearer tokens for the Figma plugin. Replaces the shared HEIMDALL_PLUGIN_SECRET on newer routes.';
