/**
 * 种子数据初始化 - 从 Excel 导入的初始数据
 * 首次启动时自动导入；通过 POST /api/reset 可重置回此数据
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, getClient } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读取初始数据文件
function loadSeedData() {
  // 尝试多个位置
  const paths = [
    path.join(__dirname, 'public', 'initial-data.js'),      // 生产
    path.join(__dirname, '..', 'web-app', 'initial-data.js') // 本地开发
  ];
  const filePath = paths.find(p => fs.existsSync(p));
  if (!filePath) {
    throw new Error('未找到 initial-data.js 文件');
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  // 从 JS 文件中提取 window.INITIAL_DATA = {...};
  const match = content.match(/window\.INITIAL_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
  if (!match) {
    throw new Error('无法从 initial-data.js 解析数据');
  }
  return JSON.parse(match[1]);
}

// 检查是否已有数据
async function hasData() {
  const result = await query('SELECT COUNT(*) FROM branches');
  return parseInt(result.rows[0].count) > 0;
}

// 导入种子数据
export async function seed() {
  if (await hasData()) {
    console.log('[Seed] 数据库已有数据，跳过初始化');
    return;
  }

  const data = loadSeedData();
  console.log(`[Seed] 开始导入：${data.branches.length} 个党支部, ${data.members.length} 名党员, ${data.records.length} 条记录`);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 批量插入党支部
    for (const b of data.branches) {
      await client.query(
        'INSERT INTO branches (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [b.id, b.name]
      );
    }

    // 批量插入党员（分批避免超时）
    const memberBatchSize = 100;
    for (let i = 0; i < data.members.length; i += memberBatchSize) {
      const batch = data.members.slice(i, i + memberBatchSize);
      for (const m of batch) {
        await client.query(
          'INSERT INTO members (id, branch_id, name, join_date) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [m.id, m.branchId, m.name, m.joinDate || '']
        );
      }
    }

    // 批量插入记录
    const recordBatchSize = 500;
    for (let i = 0; i < data.records.length; i += recordBatchSize) {
      const batch = data.records.slice(i, i + recordBatchSize);
      for (const r of batch) {
        await client.query(
          'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
          [r.id, r.memberId, r.branchId, r.trainingDate, r.methodAndContent, r.duration]
        );
      }
      console.log(`[Seed] 记录导入进度：${Math.min(i + recordBatchSize, data.records.length)}/${data.records.length}`);
    }

    await client.query('COMMIT');
    console.log('[Seed] 数据导入完成');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 重置为种子数据
export async function resetToSeed() {
  const data = loadSeedData();
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM records');
    await client.query('DELETE FROM members');
    await client.query('DELETE FROM branches');

    for (const b of data.branches) {
      await client.query('INSERT INTO branches (id, name) VALUES ($1, $2)', [b.id, b.name]);
    }
    for (const m of data.members) {
      await client.query(
        'INSERT INTO members (id, branch_id, name, join_date) VALUES ($1, $2, $3, $4)',
        [m.id, m.branchId, m.name, m.joinDate || '']
      );
    }
    for (const r of data.records) {
      await client.query(
        'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES ($1, $2, $3, $4, $5, $6)',
        [r.id, r.memberId, r.branchId, r.trainingDate, r.methodAndContent, r.duration]
      );
    }

    await client.query('COMMIT');
    console.log('[Seed] 已重置为初始数据');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
