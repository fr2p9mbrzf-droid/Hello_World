-- Existing MY LIFE project: enable photos alongside videos.
-- Safe to rerun; existing files, rows and access policies remain unchanged.
begin;
update storage.buckets
set allowed_mime_types = array[
  'video/mp4','video/webm','video/quicktime',
  'image/jpeg','image/png','image/webp','image/gif'
]::text[]
where id = 'vlog-videos';
commit;
