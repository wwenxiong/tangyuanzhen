/**
 * Cloudflare Pages Functions (_worker.js)
 * 使用 D1 数据库提供所有 /api/* 接口
 * 所有接口与原 Express 后端 100% 兼容，前端 web-app 无需任何改动
 * 不同人/不同地点访问同一个 Pages 域名，共享同一份 D1 数据
 */

// ==================== 工具函数 ====================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

// ==================== 数据库：建表 + 种子 ====================

const SCHEMA_STATEMENTS = [
  'CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, name TEXT NOT NULL, join_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, branch_id TEXT NOT NULL, training_date TEXT, method_and_content TEXT, duration TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)',
  'CREATE INDEX IF NOT EXISTS idx_members_branch ON members(branch_id)',
  'CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_records_branch ON records(branch_id)'
];

let _seedCache = null;

async function ensureSchemaAndSeed(db, env, request) {
  // 建表（逐条 prepare/run 执行，完美兼容 Cloudflare D1 规范）
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }

  // 检查是否已有数据
  const { results } = await db.prepare('SELECT COUNT(*) AS cnt FROM branches').all();
  const count = results && results[0] ? results[0].cnt : 0;
  if (count > 0) return;

  // 读取种子数据（优先缓存，其次从静态 /initial-data.js 抓取）
  let initialData = _seedCache;
  if (!initialData) {
    try {
      const url = new URL(request.url);
      const targetUrl = `${url.origin}/initial-data.js`;
      let initResp = null;
      if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        initResp = await env.ASSETS.fetch(new Request(targetUrl));
      } else {
        initResp = await fetch(targetUrl);
      }
      if (initResp && initResp.ok) {
        const text = await initResp.text();
        const match = text.match(/window\.INITIAL_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
        if (match) {
          initialData = JSON.parse(match[1]);
          _seedCache = initialData;
        }
      }
    } catch (e) {
      console.warn('[Seed] 无法获取 initial-data.js:', e.message);
    }
  }

  if (!initialData || !initialData.branches) return;

  // 分批导入，避免单次 batch 过大
  const BATCH_SIZE = 100;

  // 党支部
  for (let i = 0; i < initialData.branches.length; i += BATCH_SIZE) {
    const batch = initialData.branches.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(b =>
      db.prepare('INSERT INTO branches (id, name, created_at) VALUES (?, ?, ?)')
        .bind(b.id, b.name, b.createdAt || new Date().toISOString())
    );
    await db.batch(stmts);
  }

  // 党员
  const members = initialData.members || [];
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(m =>
      db.prepare('INSERT INTO members (id, branch_id, name, join_date, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(m.id, m.branchId, m.name, m.joinDate || '', m.createdAt || new Date().toISOString())
    );
    await db.batch(stmts);
  }

  // 培训记录
  const records = initialData.records || [];
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(r =>
      db.prepare('INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(r.id, r.memberId, r.branchId, r.trainingDate || '', r.methodAndContent || '', r.duration || '', r.createdAt || new Date().toISOString())
    );
    await db.batch(stmts);
  }

  console.log(`[Seed] 导入完成：${initialData.branches.length} 支部, ${members.length} 党员, ${records.length} 记录`);
}

async function resetToSeed(db, env, request) {
  _seedCache = null;
  await db.batch([
    db.prepare('DELETE FROM records'),
    db.prepare('DELETE FROM members'),
    db.prepare('DELETE FROM branches')
  ]);
  await ensureSchemaAndSeed(db, env, request);
}

// ==================== 路由处理 ====================

function matchRoute(pathname) {
  // pathname 形如 "/api/branches" 等
  const parts = pathname.split('/').filter(Boolean); // ['api','branches'] 等
  if (parts[0] !== 'api') return null;
  const seg = parts.slice(1);

  // /api/stats
  if (seg.length === 1 && seg[0] === 'stats') return { name: 'stats' };
  // /api/export
  if (seg.length === 1 && seg[0] === 'export') return { name: 'export' };
  // /api/import
  if (seg.length === 1 && seg[0] === 'import') return { name: 'import' };
  // /api/reset
  if (seg.length === 1 && seg[0] === 'reset') return { name: 'reset' };

  // /api/branches
  if (seg.length === 1 && seg[0] === 'branches') return { name: 'branches' };
  // /api/branches/import
  if (seg.length === 2 && seg[0] === 'branches' && seg[1] === 'import') return { name: 'branchesImport' };
  // /api/branches/:id
  if (seg.length === 2 && seg[0] === 'branches') return { name: 'branchById', id: seg[1] };
  // /api/branches/:branchId/members
  if (seg.length === 3 && seg[0] === 'branches' && seg[2] === 'members') return { name: 'branchMembers', branchId: seg[1] };
  // /api/branches/:branchId/records
  if (seg.length === 3 && seg[0] === 'branches' && seg[2] === 'records') return { name: 'branchRecords', branchId: seg[1] };

  // /api/members
  if (seg.length === 1 && seg[0] === 'members') return { name: 'members' };
  // /api/members/:id
  if (seg.length === 2 && seg[0] === 'members') return { name: 'memberById', id: seg[1] };
  // /api/members/:memberId/records
  if (seg.length === 3 && seg[0] === 'members' && seg[2] === 'records') return { name: 'memberRecords', memberId: seg[1] };

  // /api/records
  if (seg.length === 1 && seg[0] === 'records') return { name: 'records' };
  // /api/records/:id
  if (seg.length === 2 && seg[0] === 'records') return { name: 'recordById', id: seg[1] };

  return null;
}

async function handleApi({ db, env, route, method, body, request }) {
  switch (route.name) {

    // ============ 党支部 ============
    case 'branches': {
      if (method === 'GET') {
        const { results } = await db.prepare(
          'SELECT id, name, created_at FROM branches ORDER BY name'
        ).all();
        return jsonResponse(results.map(r => ({
          id: r.id, name: r.name, createdAt: r.created_at
        })));
      }
      if (method === 'POST') {
        const { name } = body || {};
        if (!name) return errorResponse('党支部名称不能为空', 400);
        const id = genId();
        await db.prepare('INSERT INTO branches (id, name) VALUES (?, ?)').bind(id, name).run();
        const { results } = await db.prepare(
          'SELECT id, name, created_at FROM branches WHERE id = ?'
        ).bind(id).all();
        const r = results[0];
        return jsonResponse({ id: r.id, name: r.name, createdAt: r.created_at }, 201);
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'branchById': {
      if (method === 'DELETE') {
        const id = route.id;
        // 级联删除（SQLite 没有 ON DELETE CASCADE 默认，手动删）
        const stmts = [
          db.prepare('DELETE FROM records WHERE branch_id = ?').bind(id),
          db.prepare('DELETE FROM members WHERE branch_id = ?').bind(id),
          db.prepare('DELETE FROM branches WHERE id = ?').bind(id)
        ];
        await db.batch(stmts);
        return jsonResponse({ success: true });
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'branchMembers': {
      if (method === 'GET') {
        const { branchId } = route;
        const { results } = await db.prepare(
          'SELECT id, branch_id, name, join_date, created_at FROM members WHERE branch_id = ? ORDER BY created_at'
        ).bind(branchId).all();
        return jsonResponse(results.map(r => ({
          id: r.id, branchId: r.branch_id, name: r.name,
          joinDate: r.join_date, createdAt: r.created_at
        })));
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'branchRecords': {
      if (method === 'GET') {
        const { branchId } = route;
        const { results } = await db.prepare(
          'SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records WHERE branch_id = ? ORDER BY training_date ASC'
        ).bind(branchId).all();
        return jsonResponse(results.map(r => ({
          id: r.id, memberId: r.member_id, branchId: r.branch_id,
          trainingDate: r.training_date, methodAndContent: r.method_and_content,
          duration: r.duration, createdAt: r.created_at
        })));
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'branchesImport': {
      if (method !== 'POST') return errorResponse('Method Not Allowed', 405);
      const { mode, branchName, replaceBranchId, members, records } = body || {};
      if (!mode || (mode !== 'add' && mode !== 'replace')) {
        return errorResponse('mode 必须为 add 或 replace', 400);
      }
      if (!Array.isArray(members) || !Array.isArray(records)) {
        return errorResponse('members / records 必须为数组', 400);
      }

      let branchId;
      let finalBranchName;
      const stmts = [];

      if (mode === 'add') {
        const name = (branchName || '').trim();
        if (!name) return errorResponse('党支部名称不能为空', 400);
        const exist = await db.prepare('SELECT id FROM branches WHERE name = ?').bind(name).all();
        if (exist.results.length > 0) {
          return errorResponse(`党支部「${name}」已存在`, 400);
        }
        branchId = genId();
        stmts.push(db.prepare('INSERT INTO branches (id, name) VALUES (?, ?)').bind(branchId, name));
        finalBranchName = name;
      } else {
        if (!replaceBranchId) return errorResponse('请选择要替换的党支部', 400);
        const exist = await db.prepare('SELECT id, name FROM branches WHERE id = ?').bind(replaceBranchId).all();
        if (exist.results.length === 0) return errorResponse('未找到要替换的党支部', 404);
        branchId = replaceBranchId;
        finalBranchName = exist.results[0].name;
        stmts.push(db.prepare('DELETE FROM records WHERE branch_id = ?').bind(branchId));
        stmts.push(db.prepare('DELETE FROM members WHERE branch_id = ?').bind(branchId));
      }

      // 党员：按姓名去重
      const nameToId = {};
      const processedMembers = [];
      for (const m of members) {
        const mName = (m.name || '').trim();
        if (!mName || nameToId[mName]) continue;
        const mid = genId();
        nameToId[mName] = mid;
        processedMembers.push({ id: mid, name: mName, joinDate: m.joinDate || '' });
        stmts.push(db.prepare(
          'INSERT INTO members (id, branch_id, name, join_date) VALUES (?, ?, ?, ?)'
        ).bind(mid, branchId, mName, m.joinDate || ''));
      }

      // 培训记录
      let recordCount = 0;
      for (const r of records) {
        const mid = nameToId[(r.memberName || '').trim()];
        if (!mid) continue;
        const rid = genId();
        stmts.push(db.prepare(
          'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(rid, mid, branchId, r.trainingDate || '', (r.methodAndContent || '').trim(), (r.duration || '').trim()));
        recordCount++;
      }

      // 事务：要么全成功要么全失败
      if (stmts.length > 0) {
        await db.batch(stmts);
      }
      return jsonResponse({
        success: true,
        id: branchId,
        name: finalBranchName,
        memberIdMap: nameToId,
        memberCount: Object.keys(nameToId).length,
        recordCount
      }, 201);
    }

    // ============ 党员 ============
    case 'members': {
      if (method === 'POST') {
        const { branchId, name, joinDate } = body || {};
        if (!branchId || !name) return errorResponse('缺少必要参数', 400);
        const id = genId();
        await db.prepare(
          'INSERT INTO members (id, branch_id, name, join_date) VALUES (?, ?, ?, ?)'
        ).bind(id, branchId, name, joinDate || '').run();
        const { results } = await db.prepare('SELECT * FROM members WHERE id = ?').bind(id).all();
        const r = results[0];
        return jsonResponse({
          id: r.id, branchId: r.branch_id, name: r.name,
          joinDate: r.join_date, createdAt: r.created_at
        }, 201);
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'memberById': {
      if (method === 'DELETE') {
        const id = route.id;
        const stmts = [
          db.prepare('DELETE FROM records WHERE member_id = ?').bind(id),
          db.prepare('DELETE FROM members WHERE id = ?').bind(id)
        ];
        await db.batch(stmts);
        return jsonResponse({ success: true });
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'memberRecords': {
      if (method === 'GET') {
        const { memberId } = route;
        const { results } = await db.prepare(
          'SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records WHERE member_id = ? ORDER BY training_date ASC'
        ).bind(memberId).all();
        return jsonResponse(results.map(r => ({
          id: r.id, memberId: r.member_id, branchId: r.branch_id,
          trainingDate: r.training_date, methodAndContent: r.method_and_content,
          duration: r.duration, createdAt: r.created_at
        })));
      }
      return errorResponse('Method Not Allowed', 405);
    }

    // ============ 培训记录 ============
    case 'records': {
      if (method === 'POST') {
        const { memberIds, trainingDate, methodAndContent, duration } = body || {};
        if (!memberIds || memberIds.length === 0) {
          return errorResponse('请至少选择一名党员', 400);
        }
        let created = 0;
        const stmts = [];
        for (const memberId of memberIds) {
          const mRes = await db.prepare('SELECT branch_id FROM members WHERE id = ?').bind(memberId).all();
          if (mRes.results.length === 0) continue;
          const branchId = mRes.results[0].branch_id;
          const id = genId();
          stmts.push(db.prepare(
            'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(id, memberId, branchId, trainingDate, methodAndContent, duration));
          created++;
        }
        if (stmts.length > 0) await db.batch(stmts);
        return jsonResponse({ success: true, count: created }, 201);
      }
      return errorResponse('Method Not Allowed', 405);
    }

    case 'recordById': {
      if (method === 'DELETE') {
        const id = route.id;
        await db.prepare('DELETE FROM records WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }
      return errorResponse('Method Not Allowed', 405);
    }

    // ============ 统计 ============
    case 'stats': {
      if (method !== 'GET') return errorResponse('Method Not Allowed', 405);
      const b = await db.prepare('SELECT COUNT(*) AS cnt FROM branches').all();
      const m = await db.prepare('SELECT COUNT(*) AS cnt FROM members').all();
      const r = await db.prepare('SELECT COUNT(*) AS cnt FROM records').all();
      const branchCount = b.results[0].cnt;
      const memberCount = m.results[0].cnt;
      const recordCount = r.results[0].cnt;

      // 各支部统计（使用子查询）
      const { results: branchStats } = await db.prepare(`
        SELECT b.id AS id, b.name AS name,
          (SELECT COUNT(*) FROM members m WHERE m.branch_id = b.id) AS member_count,
          (SELECT COUNT(*) FROM records r WHERE r.branch_id = b.id) AS record_count
        FROM branches b ORDER BY b.name
      `).all();

      return jsonResponse({
        branchCount,
        memberCount,
        recordCount,
        branches: branchStats.map(s => ({
          id: s.id, name: s.name,
          memberCount: s.member_count,
          recordCount: s.record_count
        }))
      });
    }

    // ============ 导出 ============
    case 'export': {
      if (method !== 'GET') return errorResponse('Method Not Allowed', 405);
      const b = await db.prepare('SELECT id, name, created_at FROM branches ORDER BY name').all();
      const m = await db.prepare('SELECT id, branch_id, name, join_date, created_at FROM members ORDER BY created_at').all();
      const r = await db.prepare('SELECT id, member_id, branch_id, training_date, method_and_content, duration, created_at FROM records ORDER BY training_date').all();
      return jsonResponse({
        branches: b.results.map(x => ({ id: x.id, name: x.name, createdAt: x.created_at })),
        members: m.results.map(x => ({
          id: x.id, branchId: x.branch_id, name: x.name,
          joinDate: x.join_date, createdAt: x.created_at
        })),
        records: r.results.map(x => ({
          id: x.id, memberId: x.member_id, branchId: x.branch_id,
          trainingDate: x.training_date, methodAndContent: x.method_and_content,
          duration: x.duration, createdAt: x.created_at
        }))
      });
    }

    // ============ 导入（清空+全量替换） ============
    case 'import': {
      if (method !== 'POST') return errorResponse('Method Not Allowed', 405);
      const data = body;
      if (!data || !data.branches) return errorResponse('数据格式错误', 400);

      const stmts = [
        db.prepare('DELETE FROM records'),
        db.prepare('DELETE FROM members'),
        db.prepare('DELETE FROM branches')
      ];

      for (const b of data.branches) {
        stmts.push(db.prepare('INSERT INTO branches (id, name, created_at) VALUES (?, ?, ?)')
          .bind(b.id, b.name, b.createdAt || new Date().toISOString()));
      }
      if (data.members) {
        for (const m of data.members) {
          stmts.push(db.prepare(
            'INSERT INTO members (id, branch_id, name, join_date, created_at) VALUES (?, ?, ?, ?, ?)'
          ).bind(m.id, m.branchId, m.name, m.joinDate || '', m.createdAt || new Date().toISOString()));
        }
      }
      if (data.records) {
        for (const r of data.records) {
          stmts.push(db.prepare(
            'INSERT INTO records (id, member_id, branch_id, training_date, method_and_content, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(r.id, r.memberId, r.branchId, r.trainingDate || '', r.methodAndContent || '', r.duration || '', r.createdAt || new Date().toISOString()));
        }
      }

      await db.batch(stmts);
      return jsonResponse({
        success: true,
        count: {
          branches: data.branches.length,
          members: data.members?.length || 0,
          records: data.records?.length || 0
        }
      });
    }

    // ============ 重置为初始种子数据 ============
    case 'reset': {
      if (method !== 'POST') return errorResponse('Method Not Allowed', 405);
      await resetToSeed(db, env, request);
      return jsonResponse({ success: true, message: '已重置为初始数据' });
    }

    default:
      return errorResponse('Not Found', 404);
  }
}

// ==================== Worker 入口 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // 非 /api/* 路径：交给 Pages 静态资源服务
    if (!pathname.startsWith('/api/') && pathname !== '/api') {
      return env.ASSETS.fetch(request);
    }

    const db = env.DB;
    if (!db) {
      return errorResponse('D1 数据库绑定未配置，请在 Cloudflare Pages 绑定名为 DB 的 D1 数据库', 500);
    }

    // 建表 + 种子数据（幂等）
    try {
      await ensureSchemaAndSeed(db, env, request);
    } catch (e) {
      console.error('[Init] 初始化失败:', e);
      return errorResponse('数据库初始化失败: ' + e.message, 500);
    }

    const route = matchRoute(pathname);
    if (!route) return errorResponse('Not Found', 404);

    let body = null;
    if (request.method === 'POST') {
      body = await readJsonBody(request);
      if (body === null && pathname !== '/api/reset') {
        return errorResponse('请求体必须为 JSON', 400);
      }
    }

    try {
      return await handleApi({
        db,
        env,
        route,
        method: request.method,
        body,
        request
      });
    } catch (e) {
      console.error('[API] 处理异常:', e);
      return errorResponse(e.message || '服务器内部错误', 500);
    }
  }
};
