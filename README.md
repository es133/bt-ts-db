# bt_node_mysql

mysql2 기반 MySQL 래퍼 (TypeScript).

## 빌드

```
npm install
npm run build
```

## 사용

```ts
import { BtMysql, BtMysqlConfig, BtMysqlAbstractDao } from 'bt_node_mysql';

const config = new BtMysqlConfig({ host, user, password, database, connectionLimit: 20 });
const pool = await BtMysql.buildConnectionPool(config);
const dao = new BtMysqlAbstractDao(pool);
const rows = await dao.execute('SELECT * FROM t WHERE id = ?', [1]);
await pool.disconnectPool();
```

## 테스트 (실제 DB 필요)

환경변수 `DB_HOST`, `DB_USER`, `DB_PASSWD`, `DB_NAME` 설정 후:

```
cd test && ./test.sh connection_pool.ts
```
