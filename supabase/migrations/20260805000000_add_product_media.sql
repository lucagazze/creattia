-- Product URL imports can contain both photos and videos. Keep the media type
-- on the existing product gallery table so old image rows remain compatible.
alter table public.creative_product_images
  add column if not exists media_type text not null default 'image'
    check (media_type in ('image', 'video'));

-- The product bucket was originally image-only. Product videos are imported
-- privately and are exposed to the owner through signed URLs.
update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/png', 'image/jpeg', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'
  ]
where id = 'creative-assets';

create index if not exists creative_product_media_type_idx
  on public.creative_product_images(product_id, media_type, sort_order);
