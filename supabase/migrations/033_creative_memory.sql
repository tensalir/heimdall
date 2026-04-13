-- Creative Memory: first-party ad library for Iterator pattern recall.
-- Stores creative families (one concept, multiple ratio siblings),
-- individual assets with visual fingerprints, and Voyage embeddings
-- for hybrid retrieval (metadata filters + vector similarity).

-- Reuses the pgvector extension already enabled in 009_evidence_rag.sql
-- and the same Voyage 1024-d embedding dimension used in 020_meta_intelligence.sql.

-- ============================================================
-- 1) Creative families — one record per ad concept
-- ============================================================

create table if not exists creative_families (
  id              uuid primary key default gen_random_uuid(),
  family_name     text not null,
  product         text,
  use_case        text,
  campaign_token  text,
  status          text not null default 'approved'
                    check (status in ('active', 'approved', 'evergreen', 'retired')),
  frontify_folder_id text,
  figma_file_key  text,
  figma_page_id   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(family_name)
);

create index if not exists idx_cf_product on creative_families(product) where product is not null;
create index if not exists idx_cf_use_case on creative_families(use_case) where use_case is not null;
create index if not exists idx_cf_status on creative_families(status);
create index if not exists idx_cf_campaign on creative_families(campaign_token) where campaign_token is not null;

-- ============================================================
-- 2) Creative assets — one record per ratio variant
-- ============================================================

create table if not exists creative_assets (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references creative_families(id) on delete cascade,
  ratio             text not null check (ratio in ('9x16', '4x5', '1x1')),
  frontify_asset_id text,
  download_url      text,
  thumbnail_url     text,
  figma_node_id     text,
  width             int,
  height            int,
  fingerprint       jsonb,
  retrieval_summary text,
  created_at        timestamptz not null default now(),
  unique(frontify_asset_id)
);

create index if not exists idx_ca_family on creative_assets(family_id);
create index if not exists idx_ca_ratio on creative_assets(ratio);
create index if not exists idx_ca_fingerprint_archetype
  on creative_assets ((fingerprint->>'compositionArchetype'))
  where fingerprint is not null;

-- ============================================================
-- 3) Creative memory embeddings (Voyage 1024-d via pgvector)
-- ============================================================

create table if not exists creative_memory_embeddings (
  id                      uuid primary key default gen_random_uuid(),
  family_id               uuid not null references creative_families(id) on delete cascade,
  asset_id                uuid references creative_assets(id) on delete set null,
  embedding_text          text not null,
  content_hash            text not null,
  embedding               vector(1024) not null,
  product                 text,
  use_case                text,
  composition_archetype   text,
  palette_mood            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(family_id, asset_id)
);

create index if not exists idx_cme_embedding
  on creative_memory_embeddings using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index if not exists idx_cme_product
  on creative_memory_embeddings(product) where product is not null;
create index if not exists idx_cme_use_case
  on creative_memory_embeddings(use_case) where use_case is not null;
create index if not exists idx_cme_archetype
  on creative_memory_embeddings(composition_archetype) where composition_archetype is not null;

-- ============================================================
-- 4) Vector similarity search function
-- ============================================================

create or replace function match_creative_memory(
  query_embedding vector(1024),
  match_count int default 10,
  similarity_threshold float default 0.3,
  filter_product text default null,
  filter_use_case text default null,
  filter_archetype text default null,
  filter_mood text default null
)
returns table (
  id uuid,
  family_id uuid,
  asset_id uuid,
  embedding_text text,
  product text,
  use_case text,
  composition_archetype text,
  palette_mood text,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    e.id,
    e.family_id,
    e.asset_id,
    e.embedding_text,
    e.product,
    e.use_case,
    e.composition_archetype,
    e.palette_mood,
    1 - (e.embedding <=> query_embedding) as similarity
  from creative_memory_embeddings e
  where
    1 - (e.embedding <=> query_embedding) > similarity_threshold
    and (filter_product is null or e.product = filter_product)
    and (filter_use_case is null or e.use_case = filter_use_case)
    and (filter_archetype is null or e.composition_archetype = filter_archetype)
    and (filter_mood is null or e.palette_mood = filter_mood)
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_creative_memory to service_role;

-- ============================================================
-- 5) RLS: service-role only (internal infrastructure)
-- ============================================================

alter table creative_families enable row level security;
alter table creative_assets enable row level security;
alter table creative_memory_embeddings enable row level security;

create policy "Service role full access on creative_families"
  on creative_families for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role full access on creative_assets"
  on creative_assets for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Service role full access on creative_memory_embeddings"
  on creative_memory_embeddings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table creative_families is 'First-party Loop ad concepts — one record per creative family, multiple ratio siblings.';
comment on table creative_assets is 'Individual ratio variants within a creative family, with optional visual fingerprints.';
comment on table creative_memory_embeddings is 'Voyage 1024-d embeddings for creative retrieval summaries; powers Iterator pattern recall.';
comment on function match_creative_memory is 'Filtered vector similarity search for creative memory retrieval.';
