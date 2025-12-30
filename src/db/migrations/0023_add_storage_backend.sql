-- Add storage backend enum and columns to repositories table

-- Create the storage_backend enum type
DO $$ BEGIN
    CREATE TYPE storage_backend AS ENUM ('local', 's3', 'r2', 'gcs', 'minio', 'azure');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add storage columns to repositories table
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS storage_backend storage_backend NOT NULL DEFAULT 'local';
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS storage_config jsonb;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS storage_size_bytes integer DEFAULT 0;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS storage_object_count integer DEFAULT 0;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS storage_last_sync_at timestamptz;

-- Add index for storage_backend
CREATE INDEX IF NOT EXISTS idx_repositories_storage_backend ON repositories(storage_backend);
