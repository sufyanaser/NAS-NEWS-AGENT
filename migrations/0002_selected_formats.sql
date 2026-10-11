-- NAS Newsroom — Migration 0002
-- Adds explicit multi-format selection for automatic archive classification without row duplication.

ALTER TABLE stories ADD COLUMN selected_formats_json TEXT NOT NULL DEFAULT '["radio","web","facebook"]';
