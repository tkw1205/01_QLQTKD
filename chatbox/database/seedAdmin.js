'use strict';
/**
 * Seed admin user from environment variables.
 * Run: npm run seed:admin
 *
 * Required env vars: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const jsonStore = require('../src/config/jsonStore');
const { runMigrations } = require('./migrate');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Administrator';

  if (!email || !password) {
    console.error('[SeedAdmin] Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('[SeedAdmin] Error: ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  console.log(`[SeedAdmin] Creating admin user: ${email}`);
  const users = jsonStore.getCollection('users');
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`[SeedAdmin] Admin user already exists: ${email} (id: ${existing.id})`);
      console.log('[SeedAdmin] To reset password, update directly in the database or via admin panel.');
      return;
    } else {
      existing.role = 'admin';
      existing.updated_at = new Date().toISOString();
      jsonStore.saveCollection('users', users);
      console.log(`[SeedAdmin] ✓ Promoted existing user to admin: ${email}`);
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();
  const adminUser = {
    id: uuidv4(),
    email,
    password_hash: passwordHash,
    name,
    role: 'admin',
    is_active: true,
    is_available: true,
    created_at: now,
    updated_at: now,
  };
  users.push(adminUser);
  jsonStore.saveCollection('users', users);

  console.log(`[SeedAdmin] ✅ Admin created successfully!`);
  console.log(`  ID:    ${adminUser.id}`);
  console.log(`  Email: ${email}`);
  console.log(`  Name:  ${name}`);
  console.log(`  Role:  admin`);
  console.log('');
  console.log('[SeedAdmin] ⚠ Please change the admin password after first login!');
}

async function main() {
  try {
    await runMigrations();
    await seedAdmin();
    process.exit(0);
  } catch (err) {
    console.error('[SeedAdmin] Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { seedAdmin };
