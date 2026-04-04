-- Grant admin_console_user write access to AppConfig (missed by default privileges
-- which only granted SELECT). Also expand default privileges so future tables
-- created by migrations automatically get full access for admin_console_user.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_console_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AppConfig" TO admin_console_user;
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || current_user || ' IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO admin_console_user';
  END IF;
END $$;
