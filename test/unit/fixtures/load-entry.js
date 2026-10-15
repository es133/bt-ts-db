// Loads the package entry in a fresh process and prints which driver packages ended up in require.cache.
require('ts-node/register/transpile-only');
require('../../../src/BtDb');

const loaded = Object.keys(require.cache).filter((file) => /node_modules[\\/](mysql2|pg)[\\/]/.test(file));
process.stdout.write(JSON.stringify(loaded));
