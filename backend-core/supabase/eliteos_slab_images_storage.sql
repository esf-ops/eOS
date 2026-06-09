-- eliteos_slab_images_storage.sql
-- Supabase Storage bucket for Slabsmith connector image uploads (v1).
--
-- Apply manually in Supabase dashboard or CLI before enabling Windows --upload.
-- Bucket is public-read so slab_inventory API can return stable image_url values.

insert into storage.buckets (id, name, public)
values ('eliteos-slab-images', 'eliteos-slab-images', true)
on conflict (id) do update set public = excluded.public;

-- Service role uploads from backend-core bypass RLS.
-- Optional: tighten anon/authenticated policies later if direct browser uploads are added.
