/* ═══════════════════════════════════════════
   Credbusiness — Test Setup
   Configures test environment with in-memory DB
   ═══════════════════════════════════════════ */

// Set env before anything loads
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-automated-tests';
process.env.PORT = '0'; // Random port
process.env.DB_PATH = ':memory:';

const app = require('../server');

module.exports = { app };
