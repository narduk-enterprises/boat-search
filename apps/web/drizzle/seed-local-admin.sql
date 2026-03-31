-- Local D1 only: ensure admin@example.com / testpass123 exists for API login when authBackend is local.
-- Same PBKDF2 hash as layers/narduk-nuxt-layer/drizzle/seed.sql (password: testpass123).
-- Run from apps/web: pnpm run db:seed:admin

DELETE FROM users WHERE email = 'admin@example.com';

INSERT INTO users (id, email, password_hash, name, is_admin, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000002',
    'admin@example.com',
    '55b73944e7aabc084b75505077b7f315:4655b6188b3937d0c5d815df32797f19f49d7ff10b49b18abfdb5ef0fa4e1dbc',
    'Admin User',
    1,
    '2025-01-01T00:00:00.000Z',
    '2025-01-01T00:00:00.000Z'
  );
