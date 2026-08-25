/**
 * 手动执行种子数据导入
 * 用法：node seed.js
 */
import { initDB } from './db.js';
import { seed } from './seed-data.js';

async function main() {
  await initDB();
  await seed();
  process.exit(0);
}

main().catch(err => {
  console.error('种子数据导入失败:', err);
  process.exit(1);
});
