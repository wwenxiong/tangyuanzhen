/**
 * 数据库连接与初始化
 * - 有 DATABASE_URL（生产）：使用 PostgreSQL
 * - 无 DATABASE_URL（本地测试）：使用内存存储，从 initial-data.js 加载
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 自动加载 .env 配置文件（如果存在）
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
}

const USE_PG = !!process.env.DATABASE_URL;

const isLocalPg = process.env.DATABASE_URL?.includes('127.0.0.1') || process.env.DATABASE_URL?.includes('localhost');

// PostgreSQL 连接池
const pool = USE_PG ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalPg ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
}) : null;

// ============ 内存存储（本地测试） ============
let memDB = { branches: [], members: [], records: [] };

function loadMemFromSeed() {
  const paths = [
    path.join(__dirname, 'public', 'initial-data.js'),
    path.join(__dirname, '..', 'web-app', 'initial-data.js')
  ];
  const filePath = paths.find(p => fs.existsSync(p));
  if (filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const match = content.match(/window\.INITIAL_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
    if (match) {
      const data = JSON.parse(match[1]);
      // 转换为 snake_case 以匹配 SQL 查询风格
      memDB = {
        branches: (data.branches || []).map(b => ({
          id: b.id, name: b.name, created_at: b.createdAt || new Date().toISOString()
        })),
        members: (data.members || []).map(m => ({
          id: m.id, branch_id: m.branchId, name: m.name,
          join_date: m.joinDate || '', created_at: m.createdAt || new Date().toISOString()
        })),
        records: (data.records || []).map(r => ({
          id: r.id, member_id: r.memberId, branch_id: r.branchId,
          training_date: r.trainingDate, method_and_content: r.methodAndContent,
          duration: r.duration, created_at: r.createdAt || new Date().toISOString()
        }))
      };
      console.log(`[DB-Mem] 从种子数据加载: ${memDB.branches.length} 支部, ${memDB.members.length} 党员, ${memDB.records.length} 记录`);
    }
  }
}

// 内存版 query 函数（模拟 SQL）
async function memQuery(text, params) {
  // 简化：根据 SQL 类型执行
  const sql = text.trim();

  // CREATE TABLE
  if (sql.startsWith('CREATE TABLE')) return { rows: [] };

  // SELECT COUNT
  if (/SELECT\s+COUNT\(\*\)\s+FROM\s+(\w+)/.test(sql)) {
    const table = sql.match(/FROM\s+(\w+)/)[1];
    return { rows: [{ count: memDB[table] ? memDB[table].length : 0 }] };
  }

  // SELECT b.id, b.name, ... branch stats
  if (sql.includes('SELECT b.id, b.name')) {
    const result = memDB.branches.map(b => ({
      id: b.id,
      name: b.name,
      member_count: memDB.members.filter(m => m.branch_id === b.id).length,
      record_count: memDB.records.filter(r => r.branch_id === b.id).length
    }));
    return { rows: result };
  }

  // SELECT branches
  if (sql.startsWith('SELECT') && sql.includes('FROM branches') && !sql.includes('WHERE')) {
    return { rows: [...memDB.branches].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  // SELECT branches WHERE id
  if (sql.includes('FROM branches') && sql.includes('WHERE id')) {
    const id = params[0];
    const b = memDB.branches.find(x => x.id === id);
    return { rows: b ? [b] : [] };
  }

  // SELECT members
  if (sql.includes('FROM members')) {
    if (sql.includes('WHERE branch_id')) {
      const branchId = params[0];
      return { rows: memDB.members.filter(m => m.branch_id === branchId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) };
    }
    if (sql.includes('WHERE id')) {
      const id = params[0];
      return { rows: memDB.members.filter(m => m.id === id) };
    }
    return { rows: [...memDB.members] };
  }

  // SELECT records
  if (sql.includes('FROM records')) {
    if (sql.includes('WHERE member_id')) {
      const memberId = params[0];
      return { rows: memDB.records.filter(r => r.member_id === memberId).sort((a, b) => (a.training_date || '').localeCompare(b.training_date || '')) };
    }
    if (sql.includes('WHERE branch_id')) {
      const branchId = params[0];
      return { rows: memDB.records.filter(r => r.branch_id === branchId).sort((a, b) => (a.training_date || '').localeCompare(b.training_date || '')) };
    }
    return { rows: [...memDB.records] };
  }

  // INSERT branches
  if (sql.startsWith('INSERT INTO branches')) {
    const [id, name] = params;
    memDB.branches.push({ id, name, created_at: new Date().toISOString() });
    return { rows: [] };
  }

  // INSERT members
  if (sql.startsWith('INSERT INTO members')) {
    const [id, branchId, name, joinDate] = params;
    memDB.members.push({ id, branch_id: branchId, name, join_date: joinDate, created_at: new Date().toISOString() });
    return { rows: [] };
  }

  // INSERT records
  if (sql.startsWith('INSERT INTO records')) {
    const [id, memberId, branchId, trainingDate, methodAndContent, duration] = params;
    memDB.records.push({ id, member_id: memberId, branch_id: branchId, training_date: trainingDate, method_and_content: methodAndContent, duration, created_at: new Date().toISOString() });
    return { rows: [] };
  }

  // DELETE branches
  if (sql.startsWith('DELETE FROM branches')) {
    const id = params[0];
    const members = memDB.members.filter(m => m.branch_id === id);
    memDB.branches = memDB.branches.filter(b => b.id !== id);
    memDB.members = memDB.members.filter(m => m.branch_id !== id);
    memDB.records = memDB.records.filter(r => r.branch_id !== id);
    return { rows: [] };
  }

  // DELETE members
  if (sql.startsWith('DELETE FROM members')) {
    const id = params[0];
    memDB.members = memDB.members.filter(m => m.id !== id);
    memDB.records = memDB.records.filter(r => r.member_id !== id);
    return { rows: [] };
  }

  // DELETE records
  if (sql.startsWith('DELETE FROM records')) {
    if (params && params.length > 0) {
      const id = params[0];
      memDB.records = memDB.records.filter(r => r.id !== id);
    } else {
      memDB.records = [];
    }
    return { rows: [] };
  }

  // DELETE ALL
  if (sql === 'DELETE FROM members') { memDB.members = []; memDB.records = []; return { rows: [] }; }
  if (sql === 'DELETE FROM branches') { memDB.branches = []; memDB.members = []; memDB.records = []; return { rows: [] }; }

  console.warn('[DB-Mem] 未处理的SQL:', sql.substring(0, 80));
  return { rows: [] };
}

// ============ 统一接口 ============

// 表结构 SQL（PostgreSQL 用）
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS branches (
  id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS members (
  id VARCHAR(32) PRIMARY KEY,
  branch_id VARCHAR(32) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  join_date VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS records (
  id VARCHAR(32) PRIMARY KEY,
  member_id VARCHAR(32) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  branch_id VARCHAR(32) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  training_date VARCHAR(20),
  method_and_content TEXT,
  duration VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id);
CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id);
CREATE INDEX IF NOT EXISTS idx_records_branch ON records(branch_id);
`;

// 初始化表结构
export async function initDB() {
  if (USE_PG) {
    const client = await pool.connect();
    try {
      await client.query(SCHEMA_SQL);
      console.log('[DB-PG] 表结构初始化完成');
    } finally {
      client.release();
    }
  } else {
    loadMemFromSeed();
    console.log('[DB-Mem] 内存数据库已就绪');
  }
}

// 查询
export async function query(text, params = []) {
  if (USE_PG) {
    const client = await pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  } else {
    return memQuery(text, params);
  }
}

// 获取连接（用于事务）
export async function getClient() {
  if (USE_PG) {
    return await pool.connect();
  } else {
    // 内存版模拟事务
    return {
      query: memQuery,
      release: () => {},
    };
  }
}

// 导出 pool（事务用）
export const dbPool = pool;

// 生成唯一ID
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
