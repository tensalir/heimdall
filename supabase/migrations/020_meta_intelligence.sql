-- Meta Intelligence: quality gate, semantic taxonomy, vector memory, knowledge graph.
-- Extends briefing_source_items with quality/taxonomy columns,
-- adds ad_creative_embeddings for vector memory (reusing Voyage 1024-d + pgvector),
-- and ad_graph_nodes / ad_graph_edges for knowledge graph.

-- ============================================================
-- 1) Quality & taxonomy columns on briefing_source_items
-- ============================================================

alter table briefing_source_items
  add column if not exists quality_status text not null default 'pending'
    check (quality_status in ('pending', 'approved', 'rejected', 'manual_pick')),
  add column if not exists quality_score smallint check (quality_score between 0 and 100),
  add column if not exists quality_summary text,
  add column if not exists content_style_tags text[] not null default '{}',
  add column if not exists hook_type text,
  add column if not exists proof_type text,
  add column if not exists creator_style text,
  add column if not exists target_market text check (target_market in ('b2b', 'b2c')),
  add column if not exists ai_slop_risk smallint check (ai_slop_risk between 0 and 100),
  add column if not exists legibility_risk smallint check (legibility_risk between 0 and 100),
  add column if not exists duplicate_risk smallint check (duplicate_risk between 0 and 100),
  add column if not exists proof_missing_risk smallint check (proof_missing_risk between 0 and 100),
  add column if not exists days_running int,
  add column if not exists source_provider text,
  add column if not exists language text,
  add column if not exists cta_text text,
  add column if not exists collation_count int,
  add column if not exists is_top_pick boolean not null default false,
  add column if not exists picked_by text,
  add column if not exists picked_reason text,
  add column if not exists video_length_secs int;

create index if not exists idx_bsi_quality_status
  on briefing_source_items(quality_status);
create index if not exists idx_bsi_quality_score
  on briefing_source_items(quality_score desc nulls last);
create index if not exists idx_bsi_content_style
  on briefing_source_items using gin(content_style_tags);
create index if not exists idx_bsi_hook_type
  on briefing_source_items(hook_type) where hook_type is not null;
create index if not exists idx_bsi_target_market
  on briefing_source_items(target_market) where target_market is not null;
create index if not exists idx_bsi_language
  on briefing_source_items(language) where language is not null;
create index if not exists idx_bsi_top_pick
  on briefing_source_items(is_top_pick) where is_top_pick = true;
create index if not exists idx_bsi_days_running
  on briefing_source_items(days_running desc nulls last);
create index if not exists idx_bsi_source_provider
  on briefing_source_items(source_provider);

-- ============================================================
-- 2) Ad creative embeddings (vector memory layer)
--    Reuses the same Voyage v3.5 1024-d model and pgvector
--    extension established in 009_evidence_rag.sql.
-- ============================================================

create table if not exists ad_creative_embeddings (
  id              uuid primary key default gen_random_uuid(),
  source_item_id  uuid not null references briefing_source_items(id) on delete cascade,
  embedding_text  text not null,
  content_hash    text not null,
  embedding       vector(1024) not null,
  page_name       text,
  content_style   text,
  quality_status  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(source_item_id)
);

create index if not exists idx_ace_embedding
  on ad_creative_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists idx_ace_quality
  on ad_creative_embeddings(quality_status);
create index if not exists idx_ace_style
  on ad_creative_embeddings(content_style);

alter table ad_creative_embeddings enable row level security;

create or replace function match_ad_creatives(
  query_embedding vector(1024),
  match_count int default 10,
  similarity_threshold float default 0.3,
  filter_quality_status text default null,
  filter_content_style text default null
)
returns table (
  id uuid,
  source_item_id uuid,
  embedding_text text,
  page_name text,
  content_style text,
  quality_status text,
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
    e.source_item_id,
    e.embedding_text,
    e.page_name,
    e.content_style,
    e.quality_status,
    1 - (e.embedding <=> query_embedding) as similarity
  from ad_creative_embeddings e
  where
    1 - (e.embedding <=> query_embedding) > similarity_threshold
    and (filter_quality_status is null or e.quality_status = filter_quality_status)
    and (filter_content_style is null or e.content_style = filter_content_style)
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_ad_creatives to service_role;

-- ============================================================
-- 3) Knowledge graph: nodes and edges
-- ============================================================

create table if not exists ad_graph_nodes (
  id          uuid primary key default gen_random_uuid(),
  node_type   text not null check (node_type in (
    'brand', 'hook_type', 'content_style', 'offer_type',
    'emotion', 'format', 'use_case', 'proof_type', 'creator_style'
  )),
  node_key    text not null,
  label       text not null,
  metadata    jsonb not null default '{}',
  ad_count    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(node_type, node_key)
);

create index if not exists idx_agn_type on ad_graph_nodes(node_type);
create index if not exists idx_agn_key on ad_graph_nodes(node_key);
create index if not exists idx_agn_count on ad_graph_nodes(ad_count desc);

create table if not exists ad_graph_edges (
  id              uuid primary key default gen_random_uuid(),
  source_node_id  uuid not null references ad_graph_nodes(id) on delete cascade,
  target_node_id  uuid not null references ad_graph_nodes(id) on delete cascade,
  edge_type       text not null check (edge_type in (
    'ad_has', 'co_occurs', 'similar_to', 'brand_uses', 'pattern'
  )),
  source_item_id  uuid references briefing_source_items(id) on delete set null,
  weight          float not null default 1.0,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  unique(source_node_id, target_node_id, edge_type, source_item_id)
);

create index if not exists idx_age_source on ad_graph_edges(source_node_id);
create index if not exists idx_age_target on ad_graph_edges(target_node_id);
create index if not exists idx_age_type on ad_graph_edges(edge_type);
create index if not exists idx_age_item
  on ad_graph_edges(source_item_id) where source_item_id is not null;

alter table ad_graph_nodes enable row level security;
alter table ad_graph_edges enable row level security;

comment on table ad_creative_embeddings is 'Voyage 1024-d embeddings for ad creative content; powers similar-ad retrieval.';
comment on table ad_graph_nodes is 'Knowledge graph nodes: brands, hooks, styles, offers, emotions, formats, use cases.';
comment on table ad_graph_edges is 'Knowledge graph edges: relationships between graph nodes and ads.';
comment on function match_ad_creatives is 'Vector similarity search for finding related ad creatives.';
