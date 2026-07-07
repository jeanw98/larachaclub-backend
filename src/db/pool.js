const { Pool } = require('pg');
const config = require('../config/env');

const pool = new Pool(config.postgres);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

module.exports = pool;
