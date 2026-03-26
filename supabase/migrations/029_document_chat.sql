-- Loop Document Chat: collections, documents, chunks, private storage, vector search.
-- Embeddings: Voyage vector(1024). Server-side access via service role only (RLS on, no broad policies).

create extension if not exists vector;

-- Logical corpus (e.g. loop-policies, product-docs)
create table if not exists document_chat_collections (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  description       text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null
);

create index if not exists idx_document_chat_collections_slug on document_chat_collections (slug);

-- Uploaded file metadata + processing status
create table if not exists document_chat_documents (
  id                uuid primary key default gen_random_uuid(),
  collection_id     uuid not null references document_chat_collections (id) on delete cascade,
  filename          text not null,
  content_type      text,
  storage_path      text not null,
  content_hash      text not null,
  status            text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message     text,
  chunk_count       int,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null
);

create index if not exists idx_document_chat_documents_collection on document_chat_documents (collection_id);
create index if not exists idx_document_chat_documents_status on document_chat_documents (status);

-- Chunked text + embeddings for retrieval
create table if not exists document_chat_chunks (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references document_chat_documents (id) on delete cascade,
  collection_id     uuid not null references document_chat_collections (id) on delete cascade,
  chunk_index       int not null,
  content           text not null,
  content_hash      text not null,
  embedding         vector(1024) not null,
  context_json      jsonb,
  created_at        timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists idx_document_chat_chunks_document on document_chat_chunks (document_id);
create index if not exists idx_document_chat_chunks_collection on document_chat_chunks (collection_id);

create index if not exists idx_document_chat_chunks_embedding on document_chat_chunks
  using hnsw (embedding vector_cosine_ops);

alter table document_chat_collections enable row level security;
alter table document_chat_documents enable row level security;
alter table document_chat_chunks enable row level security;

-- Filtered vector search (service_role only via grant)
create or replace function match_document_chat_chunks(
  query_embedding vector(1024),
  match_count int default 10,
  similarity_threshold float default 0.25,
  filter_collection_id uuid default null,
  filter_collection_slug text default null
)
returns table (
  id uuid,
  document_id uuid,
  collection_id uuid,
  chunk_index int,
  content text,
  filename text,
  collection_slug text,
  context_json jsonb,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.collection_id,
    c.chunk_index,
    c.content,
    d.filename,
    col.slug as collection_slug,
    c.context_json,
    1 - (c.embedding <=> query_embedding) as similarity
  from document_chat_chunks c
  join document_chat_documents d on d.id = c.document_id
  join document_chat_collections col on col.id = c.collection_id
  where
    1 - (c.embedding <=> query_embedding) > similarity_threshold
    and d.status = 'ready'
    and (filter_collection_id is null or c.collection_id = filter_collection_id)
    and (filter_collection_slug is null or col.slug = filter_collection_slug)
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

grant execute on function match_document_chat_chunks to service_role;

comment on table document_chat_collections is 'Document chat corpora; RLS on, service-role writes from Heimdall API.';
comment on table document_chat_documents is 'Uploaded files for document chat; originals in storage bucket document-chat.';
comment on table document_chat_chunks is 'Chunked text with Voyage 1024-d embeddings for document chat RAG.';
comment on function match_document_chat_chunks is 'Vector similarity search over ready documents; optional collection filter.';

-- Private storage bucket (no public read policies)
insert into storage.buckets (id, name, public)
values ('document-chat', 'document-chat', false)
on conflict (id) do nothing;
