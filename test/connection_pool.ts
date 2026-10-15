#!/usr/bin/env node

import { BtMysql, BtMysqlAbstractDao, BtMysqlConfig } from '../src/BtMysql';

const dbConfig = new BtMysqlConfig({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    connectionLimit: 20,
    timezone: 'Z'
});

BtMysql.buildConnectionPool(dbConfig, true).then(async connectionPool => {
    const dao = new BtMysqlAbstractDao(connectionPool);
    const result = await dao.execute('SELECT 1 + ? AS result', [1]);
    console.log('FETCH RESULT:', result);
    await connectionPool.disconnectPool();
});
