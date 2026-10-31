'use strict';

const jsonStore = require('./jsonStore');

// Initialize store when database module is loaded
jsonStore.initAll();

async function query(text, params = []) {
  const sql = text.trim();

  // SELECT 1 (Health check / Ping)
  if (/^SELECT\s+1/i.test(sql)) {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  // UPDATE users SET is_active = false WHERE id = $1
  const updateUsersActiveMatch = sql.match(/UPDATE\s+users\s+SET\s+is_active\s*=\s*(\$1|false|true)\s+WHERE\s+id\s*=\s*\$(\d+)/i);
  if (updateUsersActiveMatch) {
    const valParam = updateUsersActiveMatch[1] === '$1' ? params[0] : (updateUsersActiveMatch[1].toLowerCase() === 'true');
    const idParam = params[parseInt(updateUsersActiveMatch[2], 10) - 1];
    const users = jsonStore.getCollection('users');
    const user = users.find(u => u.id === idParam);
    if (user) {
      user.is_active = Boolean(valParam);
      user.updated_at = new Date().toISOString();
      jsonStore.saveCollection('users', users);
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // UPDATE users SET role = $1 ... WHERE email = $2
  if (/UPDATE\s+users\s+SET\s+role\s*=\s*\$1/i.test(sql) && /WHERE\s+email\s*=\s*\$2/i.test(sql)) {
    const users = jsonStore.getCollection('users');
    const user = users.find(u => u.email.toLowerCase() === (params[1] || '').toLowerCase());
    if (user) {
      user.role = params[0];
      user.updated_at = new Date().toISOString();
      jsonStore.saveCollection('users', users);
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // DELETE FROM users WHERE id = $1
  if (/DELETE\s+FROM\s+users\s+WHERE\s+id\s*=\s*\$1/i.test(sql)) {
    let users = jsonStore.getCollection('users');
    const beforeCount = users.length;
    users = users.filter(u => u.id !== params[0]);
    jsonStore.saveCollection('users', users);
    return { rows: [], rowCount: beforeCount - users.length };
  }

  // DELETE FROM messages WHERE conversation_id = $1
  if (/DELETE\s+FROM\s+messages\s+WHERE\s+conversation_id\s*=\s*\$1/i.test(sql)) {
    let messages = jsonStore.getCollection('messages');
    const beforeCount = messages.length;
    messages = messages.filter(m => m.conversation_id !== params[0]);
    jsonStore.saveCollection('messages', messages);
    return { rows: [], rowCount: beforeCount - messages.length };
  }

  // DELETE FROM conversations WHERE id = $1
  if (/DELETE\s+FROM\s+conversations\s+WHERE\s+id\s*=\s*\$1/i.test(sql)) {
    let conversations = jsonStore.getCollection('conversations');
    const beforeCount = conversations.length;
    conversations = conversations.filter(c => c.id !== params[0]);
    jsonStore.saveCollection('conversations', conversations);
    return { rows: [], rowCount: beforeCount - conversations.length };
  }

  // DELETE FROM appointments WHERE guest_session_id IN ($1, $2)
  if (/DELETE\s+FROM\s+appointments\s+WHERE\s+guest_session_id\s+IN/i.test(sql)) {
    let appointments = jsonStore.getCollection('appointments');
    const beforeCount = appointments.length;
    appointments = appointments.filter(a => !params.includes(a.guest_session_id));
    jsonStore.saveCollection('appointments', appointments);
    return { rows: [], rowCount: beforeCount - appointments.length };
  }

  // Default fallback for any query
  return { rows: [], rowCount: 0 };
}

async function getClient() {
  return {
    query,
    release: () => {},
  };
}

async function withTransaction(fn) {
  jsonStore.beginTransaction();
  const client = await getClient();
  try {
    const result = await fn(client);
    jsonStore.commitTransaction();
    return result;
  } catch (err) {
    jsonStore.rollbackTransaction();
    throw err;
  }
}

async function waitForDatabase() {
  jsonStore.initAll();
  return true;
}

const mockPool = {
  query,
  connect: getClient,
  on: () => {},
  end: async () => {},
};

function getPool() {
  return mockPool;
}

module.exports = {
  query,
  getClient,
  withTransaction,
  waitForDatabase,
  getPool,
};
