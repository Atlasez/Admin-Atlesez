-- The primary operator must remain able to enter the admin portal even when
-- the permission row was lost from an existing production database.
-- Keep this repair idempotent so it is safe to apply during normal deploys.
INSERT OR IGNORE INTO report_admin_permissions (email, subject)
VALUES ('ukyoukay0@gmail.com', '*');
