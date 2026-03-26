-- Document chat: parsed markdown on documents, knowledge graph entities/relations, graph search RPC.

-- Required before gin (name gin_trgm_ops) index (same pattern as vector in 009/029)
create extension if not exists pg_trgm;

alter table document_chat_documents
  add column if not exists parsed_markdown text;

comment on column document_chat_documents.parsed_markdown is 'LlamaParse / markdown source used for chunking and KG (optional).';

-- Deduped entities per collection
create table if not exists document_chat_entities (
  id                uuid primary key default gen_random_uuid(),
  collection_id     uuid not null references document_chat_collections (id) on delete cascade,
  name              text not null,
  entity_type       text not null,
  description       text,
  metadata_json     jsonb,
  created_at        timestamptz not null default now(),
  unique (collection_id, name, entity_type)
);

create index if not exists idx_document_chat_entities_collection on document_chat_entities (collection_id);
create index if not exists idx_document_chat_entities_name_trgm on document_chat_entities using gin (name gin_trgm_ops);

-- Relations between entities, provenance on chunk
create table if not exists document_chat_relations (
  id                  uuid primary key default gen_random_uuid(),
  collection_id       uuid not null references document_chat_collections (id) on delete cascade,
  source_entity_id    uuid not null references document_chat_entities (id) on delete cascade,
  target_entity_id    uuid not null references document_chat_entities (id) on delete cascade,
  relation_type       text not null,
  evidence_chunk_id   uuid references document_chat_chunks (id) on delete cascade,
  confidence          float,
  metadata_json       jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists idx_document_chat_relations_collection on document_chat_relations (collection_id);
create index if not exists idx_document_chat_relations_source on document_chat_relations (source_entity_id);
create index if not exists idx_document_chat_relations_target on document_chat_relations (target_entity_id);
create index if not exists idx_document_chat_relations_evidence on document_chat_relations (evidence_chunk_id);

alter table document_chat_entities enable row level security;
alter table document_chat_relations enable row level security;

-- 1-hop graph context: entities matching query + neighbors + connecting relations
create or replace function search_document_chat_graph(
  search_query text,
  filter_collection_id uuid default null,
  filter_collection_slug text default null,
  max_entities int default 12,
  max_relations int default 40
)
returns table (
  entity_id uuid,
  entity_name text,
  entity_type text,
  entity_description text,
  neighbor_entity_id uuid,
  neighbor_name text,
  neighbor_type text,
  relation_type text,
  evidence_chunk_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if filter_collection_id is null and filter_collection_slug is null then
    return;
  end if;

  return query
  with coll as (
    select c.id as cid
    from document_chat_collections c
    where
      (filter_collection_id is not null and c.id = filter_collection_id)
      or (filter_collection_slug is not null and c.slug = filter_collection_slug)
    limit 1
  ),
  matched as (
    select e.id, e.name, e.entity_type, e.description
    from document_chat_entities e
    cross join coll
    where e.collection_id = coll.cid
      and e.name ilike '%' || search_query || '%'
    order by length(e.name) asc
    limit greatest(1, least(max_entities, 100))
  ),
  neighbor_ids as (
    select distinct x.id
    from (
      select r.target_entity_id as id
      from document_chat_relations r
      where r.source_entity_id in (select id from matched)
      union
      select r.source_entity_id as id
      from document_chat_relations r
      where r.target_entity_id in (select id from matched)
    ) x
  ),
  rels as (
    select r.id, r.source_entity_id, r.target_entity_id, r.relation_type, r.evidence_chunk_id
    from document_chat_relations r
    cross join coll
    where r.collection_id = coll.cid
      and (
        r.source_entity_id in (select id from matched union select id from neighbor_ids)
        or r.target_entity_id in (select id from matched union select id from neighbor_ids)
      )
    limit greatest(1, least(max_relations, 200))
  )
  select
    se.id as entity_id,
    se.name as entity_name,
    se.entity_type,
    se.description as entity_description,
    te.id as neighbor_entity_id,
    te.name as neighbor_name,
    te.entity_type as neighbor_type,
    r.relation_type,
    r.evidence_chunk_id
  from rels r
  join document_chat_entities se on se.id = r.source_entity_id
  join document_chat_entities te on te.id = r.target_entity_id;
end;
$$;

grant execute on function search_document_chat_graph to service_role;

-- Remove entities in a collection that no longer participate in any relation (after chunk/doc deletes).
create or replace function document_chat_prune_orphan_entities(p_collection_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from document_chat_entities e
    where e.collection_id = p_collection_id
      and not exists (
        select 1 from document_chat_relations r
        where r.source_entity_id = e.id or r.target_entity_id = e.id
      )
    returning e.id
  )
  select coalesce((select count(*)::int from deleted), 0);
$$;

grant execute on function document_chat_prune_orphan_entities to service_role;

comment on table document_chat_entities is 'KG entities per collection; RLS on, service-role writes.';
comment on table document_chat_relations is 'KG edges with optional evidence_chunk_id; cascade delete with chunks.';
comment on function search_document_chat_graph is 'ILIKE entity match + 1-hop relations for hybrid retrieval.';
