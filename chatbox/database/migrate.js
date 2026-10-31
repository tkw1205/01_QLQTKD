'use strict';
require('dotenv').config();

const jsonStore = require('../src/config/jsonStore');

// ─── Migration definitions ────────────────────────────────────────────────────

const MIGRATIONS = [
  { version: 1, name: 'create_extensions_and_enums' },
  { version: 2, name: 'create_users_table' },
  { version: 3, name: 'create_categories_table' },
  { version: 4, name: 'create_products_table' },
  { version: 5, name: 'create_conversations_table' },
  { version: 6, name: 'create_messages_table' },
  { version: 7, name: 'create_appointments_table' },
  { version: 8, name: 'create_system_settings_table' },
  { version: 9, name: 'create_business_settings_table' },
];

async function runMigrations() {
  console.log('[Migrate] Checking schema migrations (Mock JSON)...');
  jsonStore.initAll();

  const migrations = jsonStore.getCollection('schema_migrations') || [];
  const appliedVersions = new Set(migrations.map(m => m.version));

  const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version));

  if (pending.length === 0) {
    console.log('[Migrate] Schema is up to date.');
    return;
  }

  console.log(`[Migrate] Running ${pending.length} pending migration(s)...`);

  for (const migration of pending) {
    console.log(`[Migrate] Applying v${migration.version}: ${migration.name}`);
    migrations.push({
      version: migration.version,
      name: migration.name,
      applied_at: new Date().toISOString(),
    });
    console.log(`[Migrate] ✓ v${migration.version} applied`);
  }

  jsonStore.saveCollection('schema_migrations', migrations);
  console.log('[Migrate] All migrations applied successfully (Mock JSON).');
}

// ─── Standalone run ───────────────────────────────────────────────────────────
if (require.main === module) {
  (async () => {
    try {
      await runMigrations();
      console.log('[Migrate] Done.');
      process.exit(0);
    } catch (err) {
      console.error('[Migrate] Error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { runMigrations };
