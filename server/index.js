/**
 * Express 服务器 - 党员培训记录管理系统 API
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDB, query, genId, getClient } from './db.js';
import { seed } from './seed-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============ 静态文件托管（前端） ============
// 本地开发：从 ../web-app 提供前端文件；生产（Render）：从 ./public 提供
let publicDir;
const devDir = path.join(__dirname, '..', 'web-app');
const prodDir = path.join(__dirname, 'public');
if (fs.existsSync(devDir)) {
  publicDir = devDir;
} else {
  publicDir = prodDir;
}
app.use(express.static(publicDir));

// ============ 党支部 API ============

// 获取所有党支部
app.get('/api/branches', async (req, res) => {
  try {
    const result = await query('SELECT id, name, created_at FROM branches ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/branches:', err);
    res.status(500).json({ error: '获取党支部列表失败' });
  }
});

// 创建党支部
app.post('/api/branches', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '党支部名称不能为空' });

    const id = genId();
    await query('INSERT INTO branches (id, name) VALUES ($1, $2)', [id, name]);
    const result = await query('SELECT id, name, created_at FROM branches WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/branches:', err);
    res.status(500).json({ error: '创建党支部失败' });
  }
});

// 删除党支部（级联删除党员和记录）
app.delete('/api/branches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM branches WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/branches/:id:', err);
    res.status(500).json({ error: '删除党支部失败' });
  }
});

// ============ 党员 API ============

// 获取支部的党员列表
app.get('/api/branches/:branchId/members', async (req, res) => {
  try {
    const { branchId } = req.params;
    const result = await query(
      'SELECT id, branch_id, name, join_date, created_at FROM members WHERE branch_id = $1 ORDER BY created_at',
      [branchId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      branchId: r.branch_id,
      name: r.name,
      joinDate: r.join_date,
      createdAt: r.created_at
    })));
  } catch (err) {
    console.error('GET members:', err);
    res.status(500).json({ error: '获取党员列表失败' });
  }
});

// 创建党员
app.post('/api/members', async (req, res) => {
  try {
    const { branchId, name, joinDate } = req.body;
    if (!branchId || !name) return res.status(400).json({ error: '缺少必要参数' });

    const id = genId();
    await query(
      'INSERT INTO members (id, branch_id, name, join_date) VALUES ($1, $2, $3, $4)',
      [id, branchId, name, joinDate || '']
    );
    const result = await query('SELECT * FROM members WHERE id = $1', [id]);
    const r = result.rows[0];
    res.status(201).json({
      id: r.id,
      branchId: r.branch_id,
      name: r.name,
      joinDate: r.join_date,
      createdAt: r.created_at
    });
  } catch (err) {
    console.error('POST /api/members:', err);
    res.status(500).json({ error: '创建党员失败' });
  }
});

// 删除党员
app.delete('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM members WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE member:', err);
    res.status(500).json({ error: '删除党员失败' });
  }
});

// ============ 培训记录 API ============

// 获取党员的培训记录
app.get('/api/members/:memberId/records', async (req, res) => {
  try {
    const { memberId } = req.params;
    const result = await query(
      'SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records WHERE member_id = $1 ORDER BY training_date ASC',
      [memberId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      memberId: r.member_id,
      branchId: r.branch_id,
      trainingDate: r.training_date,
      methodAndContent: r.method_and_content,
      duration: r.duration,
      createdAt: r.created_at
    })));
  } catch (err) {
    console.error('GET records:', err);
    res.status(500).json({ error: '获取培训记录失败' });
  }
});

// 获取支部所有培训记录
app.get('/api/branches/:branchId/records', async (req, res) => {
  try {
    const { branchId } = req.params;
    const result = await query(
      'SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records WHERE branch_id = $1 ORDER BY training_date ASC',
      [branchId]
    );
    res.json(result.rows.map(r => ({
      id: r.id,
      memberId: r.member_id,
      branchId: r.branch_id,
      trainingDate: r.training_date,
      methodAndContent: r.method_and_content,
      duration: r.duration,
      createdAt: r.created_at
    })));
  } catch (err) {
    console.error('GET branch records:', err);
    res.status(500).json({ error: '获取培训记录失败' });
  }
});

// 批量添加培训记录（多名党员同一记录）
app.post('/api/records', async (req, res) => {
  try {
    const { memberIds, trainingDate, methodAndContent, duration } = req.body;
    if (!memberIds || memberIds.length === 0) {
      return res.status(400).json({ error: '请至少选择一名党员' });
    }

    const created = [];
    for (const memberId of memberIds) {
      // 获取党员所属支部
      const memberResult = await query('SELECT branch_id FROM members WHERE id = $1', [memberId]);
      if (memberResult.rows.length === 0) continue;

      const branchId = memberResult.rows[0].branch_id;
      const id = genId();
      await query(
        'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, memberId, branchId, trainingDate, methodAndContent, duration]
      );
      created.push(id);
    }

    res.status(201).json({ success: true, count: created.length });
  } catch (err) {
    console.error('POST /api/records:', err);
    res.status(500).json({ error: '添加培训记录失败' });
  }
});

// 删除培训记录
app.delete('/api/records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM records WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE record:', err);
    res.status(500).json({ error: '删除培训记录失败' });
  }
});

// ============ 统计 API ============

app.get('/api/stats', async (req, res) => {
  try {
    const branches = await query('SELECT COUNT(*) FROM branches');
    const members = await query('SELECT COUNT(*) FROM members');
    const records = await query('SELECT COUNT(*) FROM records');

    // 各支部统计
    const branchStats = await query(`
      SELECT b.id, b.name,
        (SELECT COUNT(*) FROM members m WHERE m.branch_id = b.id) AS member_count,
        (SELECT COUNT(*) FROM records r WHERE r.branch_id = b.id) AS record_count
      FROM branches b ORDER BY b.name
    `);

    res.json({
      branchCount: parseInt(branches.rows[0].count),
      memberCount: parseInt(members.rows[0].count),
      recordCount: parseInt(records.rows[0].count),
      branches: branchStats.rows.map(r => ({
        id: r.id,
        name: r.name,
        memberCount: parseInt(r.member_count),
        recordCount: parseInt(r.record_count)
      }))
    });
  } catch (err) {
    console.error('GET /api/stats:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// ============ 导出/导入 API ============

app.get('/api/export', async (req, res) => {
  try {
    const branches = await query('SELECT id, name, created_at FROM branches ORDER BY name');
    const members = await query('SELECT id, branch_id, name, join_date, created_at FROM members ORDER BY created_at');
    const records = await query('SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records ORDER BY training_date');

    res.json({
      branches: branches.rows.map(r => ({
        id: r.id, name: r.name, createdAt: r.created_at
      })),
      members: members.rows.map(r => ({
        id: r.id, branchId: r.branch_id, name: r.name,
        joinDate: r.join_date, createdAt: r.created_at
      })),
      records: records.rows.map(r => ({
        id: r.id, memberId: r.member_id, branchId: r.branch_id,
        trainingDate: r.training_date, methodAndContent: r.method_and_content,
        duration: r.duration, createdAt: r.created_at
      }))
    });
  } catch (err) {
    console.error('GET /api/export:', err);
    res.status(500).json({ error: '导出失败' });
  }
});

app.post('/api/import', async (req, res) => {
  const client = await getClient();
  try {
    const data = req.body;
    if (!data.branches) return res.status(400).json({ error: '数据格式错误' });

    await client.query('BEGIN');

    // 清空旧数据
    await client.query('DELETE FROM records');
    await client.query('DELETE FROM members');
    await client.query('DELETE FROM branches');

    // 导入党支部
    for (const b of data.branches) {
      await client.query(
        'INSERT INTO branches (id, name) VALUES ($1, $2)',
        [b.id, b.name]
      );
    }

    // 导入党员
    if (data.members) {
      for (const m of data.members) {
        await client.query(
          'INSERT INTO members (id, branch_id, name, join_date) VALUES ($1, $2, $3, $4)',
          [m.id, m.branchId, m.name, m.joinDate || '']
        );
      }
    }

    // 导入记录
    if (data.records) {
      for (const r of data.records) {
        await client.query(
          'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES ($1, $2, $3, $4, $5, $6)',
          [r.id, r.memberId, r.branchId, r.trainingDate, r.methodAndContent, r.duration]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, count: { branches: data.branches.length, members: data.members?.length || 0, records: data.records?.length || 0 } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/import:', err);
    res.status(500).json({ error: '导入失败' });
  } finally {
    client.release();
  }
});

// 重置为初始数据
app.post('/api/reset', async (req, res) => {
  try {
    const seed = await import('./seed-data.js');
    await seed.resetToSeed();
    res.json({ success: true, message: '已重置为初始数据' });
  } catch (err) {
    console.error('POST /api/reset:', err);
    res.status(500).json({ error: '重置失败' });
  }
});

// 从 Excel 导入单个党支部（新建或替换）
app.post('/api/branches/import', async (req, res) => {
  const client = await getClient();
  try {
    const { mode, branchName, replaceBranchId, members, records } = req.body;
    if (!mode || (mode !== 'add' && mode !== 'replace')) {
      return res.status(400).json({ error: 'mode 必须为 add 或 replace' });
    }
    if (!Array.isArray(members) || !Array.isArray(records)) {
      return res.status(400).json({ error: 'members / records 必须为数组' });
    }

    await client.query('BEGIN');

    let branchId;
    let finalBranchName;

    if (mode === 'add') {
      const name = (branchName || '').trim();
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '党支部名称不能为空' });
      }
      // 检查重名
      const exist = await client.query('SELECT id FROM branches WHERE name = $1', [name]);
      if (exist.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `党支部「${name}」已存在` });
      }
      branchId = genId();
      await client.query('INSERT INTO branches (id, name) VALUES ($1, $2)', [branchId, name]);
      finalBranchName = name;
    } else {
      // replace
      if (!replaceBranchId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '请选择要替换的党支部' });
      }
      const exist = await client.query('SELECT id, name FROM branches WHERE id = $1', [replaceBranchId]);
      if (exist.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '未找到要替换的党支部' });
      }
      branchId = replaceBranchId;
      finalBranchName = exist.rows[0].name;
      // 清空该支部原有党员和记录
      await client.query('DELETE FROM records WHERE branch_id = $1', [branchId]);
      await client.query('DELETE FROM members WHERE branch_id = $1', [branchId]);
    }

    // 创建党员（按姓名去重，建立 name -> id 映射）
    const nameToId = {};
    for (const m of members) {
      const mName = (m.name || '').trim();
      if (!mName || nameToId[mName]) continue;
      const mid = genId();
      await client.query(
        'INSERT INTO members (id, branch_id, name, join_date) VALUES ($1, $2, $3, $4)',
        [mid, branchId, mName, m.joinDate || '']
      );
      nameToId[mName] = mid;
    }

    // 创建培训记录
    let recordCount = 0;
    for (const r of records) {
      const mid = nameToId[(r.memberName || '').trim()];
      if (!mid) continue;
      const rid = genId();
      await client.query(
        'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES ($1, $2, $3, $4, $5, $6)',
        [rid, mid, branchId, r.trainingDate || '', (r.methodAndContent || '').trim(), (r.duration || '').trim()]
      );
      recordCount++;
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      id: branchId,
      name: finalBranchName,
      memberIdMap: nameToId,
      memberCount: Object.keys(nameToId).length,
      recordCount
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/branches/import:', err);
    res.status(500).json({ error: '导入党支部失败: ' + err.message });
  } finally {
    client.release();
  }
});

// ============ 前端路由回退 ============
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ============ 启动 ============
async function start() {
  await initDB();
  await seed();  // 首次启动自动导入初始数据
  app.listen(PORT, () => {
    console.log(`[Server] 党员培训记录管理系统运行在 http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
