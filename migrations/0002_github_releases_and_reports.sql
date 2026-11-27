ALTER TABLE projects ADD COLUMN creator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN release_url TEXT;
ALTER TABLE projects ADD COLUMN apk_url TEXT;
ALTER TABLE projects ADD COLUMN report_url TEXT;
