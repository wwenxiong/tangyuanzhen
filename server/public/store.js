/**
 * 数据存储层 - 联网版
 * 策略：从后端 API 加载到内存缓存，操作时先更新内存（即时反馈），再异步同步到后端
 * 所有人共享同一份数据（存在服务器数据库中）
 */
const Store = (function () {
  // 后端 API 地址（部署后替换为线上地址）
  const API_BASE = window.API_BASE || '';

  let state = {
    branches: [],
    members: [],
    records: [],
    currentBranchId: null
  };

  let _ready = false;
  let _readyPromise = null;

  // 生成唯一ID
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // 当前时间戳
  function now() {
    return new Date().toISOString();
  }

  // ============ API 调用封装 ============
  async function apiGet(path) {
    const res = await fetch(`${API_BASE}/api${path}`);
    if (!res.ok) throw new Error(`API ${path} 失败: ${res.status}`);
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API ${path} 失败: ${res.status}`);
    return res.json();
  }

  async function apiDelete(path) {
    const res = await fetch(`${API_BASE}/api${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API ${path} 失败: ${res.status}`);
    return res.json();
  }

  // 截断时长小数部分（不四舍五入）："2.5学时" → "2学时"，"3.7" → "3"
  function truncateDuration(d) {
    if (!d) return d;
    const s = String(d);
    const m = s.match(/^(\d+)\.(\d+)/);
    if (m) {
      const intPart = m[1];
      const suffix = s.slice(m[0].length);
      return intPart + suffix;
    }
    return s;
  }

  // 对 records 数组中的 duration 批量截断小数
  function normalizeDurations(records) {
    return (records || []).map(r => ({ ...r, duration: truncateDuration(r.duration) }));
  }

  // ============ 初始化：从后端加载全部数据 ============
  async function init() {
    if (_ready) return;
    if (_readyPromise) return _readyPromise;

    _readyPromise = (async () => {
      try {
        const data = await apiGet('/export');
        state = {
          branches: data.branches || [],
          members: data.members || [],
          records: normalizeDurations(data.records || []),
          currentBranchId: (data.branches && data.branches[0]?.id) || null
        };
        _ready = true;
        console.log('[Store] 从服务器加载数据成功：',
          state.branches.length, '个党支部,',
          state.members.length, '名党员,',
          state.records.length, '条培训记录');
      } catch (err) {
        console.error('[Store] 加载失败，使用本地缓存:', err);
        // 降级：尝试从 localStorage 加载
        await loadFromLocal();
        _ready = true;
      }
    })();

    return _readyPromise;
  }

  // 降级方案：从本地存储加载
  async function loadFromLocal() {
    try {
      const raw = localStorage.getItem('party_training_data_v2');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.branches && data.branches.length > 0) {
          state = {
            branches: data.branches,
            members: data.members || [],
            records: normalizeDurations(data.records || []),
            currentBranchId: data.currentBranchId || data.branches[0].id
          };
          return;
        }
      }
    } catch (e) {}
    // 兜底：从 initial-data.js 加载
    if (window.INITIAL_DATA && window.INITIAL_DATA.branches) {
      state = {
        branches: window.INITIAL_DATA.branches,
        members: window.INITIAL_DATA.members || [],
        records: normalizeDurations(window.INITIAL_DATA.records || []),
        currentBranchId: window.INITIAL_DATA.branches[0]?.id || null
      };
      saveLocal();
      return;
    }
    // 最终兜底：空状态
    state = { branches: [], members: [], records: [], currentBranchId: null };
  }

  // 保存到本地（降级缓存）
  function saveLocal() {
    try {
      localStorage.setItem('party_training_data_v2', JSON.stringify(state));
    } catch (e) {}
  }

  // ============ 党支部 API ============
  function getBranches() {
    return [...state.branches];
  }

  function getBranch(id) {
    return state.branches.find((b) => b.id === id) || null;
  }

  function getCurrentBranch() {
    return state.branches.find((b) => b.id === state.currentBranchId) || null;
  }

  function getCurrentBranchId() {
    return state.currentBranchId;
  }

  function setCurrentBranch(id) {
    state.currentBranchId = id;
    saveLocal();
  }

  function addBranch(name) {
    const trimmed = name.trim();
    if (state.branches.some((b) => b.name === trimmed)) {
      return { success: false, error: '该党支部已存在' };
    }
    const branch = { id: genId(), name: trimmed, createdAt: now() };
    state.branches.push(branch);
    if (!state.currentBranchId) state.currentBranchId = branch.id;
    saveLocal();
    // 异步同步到后端
    apiPost('/branches', { name: trimmed })
      .then(serverBranch => {
        // 用服务器返回的 ID 替换临时 ID
        const idx = state.branches.findIndex(b => b.id === branch.id);
        if (idx >= 0 && serverBranch.id) {
          state.branches[idx] = serverBranch;
          if (state.currentBranchId === branch.id) state.currentBranchId = serverBranch.id;
          saveLocal();
        }
      })
      .catch(err => console.error('[Store] 同步党支部到服务器失败:', err));
    return { success: true, data: branch };
  }

  function deleteBranch(id) {
    state.branches = state.branches.filter((b) => b.id !== id);
    state.members = state.members.filter((m) => m.branchId !== id);
    state.records = state.records.filter((r) => r.branchId !== id);
    if (state.currentBranchId === id) {
      state.currentBranchId = state.branches[0]?.id || null;
    }
    saveLocal();
    apiDelete(`/branches/${id}`)
      .catch(err => console.error('[Store] 删除党支部同步失败:', err));
  }

  // ============ 党员 API ============
  function getMembers(branchId) {
    return state.members
      .filter((m) => m.branchId === branchId)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  function addMembers(names, branchId) {
    const newMembers = names
      .filter((n) => n.trim())
      .map((name) => ({
        id: genId(),
        name: name.trim(),
        branchId,
        joinDate: '',
        createdAt: now()
      }));
    state.members.push(...newMembers);
    saveLocal();
    // 异步同步到后端
    Promise.all(newMembers.map(m =>
      apiPost('/members', { branchId, name: m.name })
        .then(sm => { m.id = sm.id; })
        .catch(err => console.error('[Store] 同步党员失败:', err))
    ));
    return newMembers.length;
  }

  function deleteMember(id) {
    state.members = state.members.filter((m) => m.id !== id);
    state.records = state.records.filter((r) => r.memberId === id);
    saveLocal();
    apiDelete(`/members/${id}`)
      .catch(err => console.error('[Store] 删除党员同步失败:', err));
  }

  // ============ 培训记录 API ============
  function getRecordsByMember(memberId) {
    return state.records
      .filter((r) => r.memberId === memberId)
      .sort((a, b) => (a.trainingDate || '').localeCompare(b.trainingDate || ''));
  }

  function getRecordsByBranch(branchId) {
    return state.records
      .filter((r) => r.branchId === branchId)
      .sort((a, b) => (b.trainingDate || '').localeCompare(a.trainingDate || ''));
  }

  function addTrainingRecords(form) {
    const createdAt = now();
    const newRecords = form.memberIds.map((memberId) => {
      const member = state.members.find((m) => m.id === memberId);
      return {
        id: genId(),
        memberId,
        branchId: member ? member.branchId : '',
        trainingDate: form.trainingDate,
        methodAndContent: form.methodAndContent.trim(),
        duration: form.duration.trim(),
        createdAt
      };
    });
    state.records.push(...newRecords);
    saveLocal();
    // 异步同步到后端
    apiPost('/records', {
      memberIds: form.memberIds,
      trainingDate: form.trainingDate,
      methodAndContent: form.methodAndContent.trim(),
      duration: form.duration.trim()
    })
      .then(() => console.log('[Store] 培训记录已同步到服务器'))
      .catch(err => console.error('[Store] 同步培训记录失败:', err));
    console.log('[Store] 新增培训记录', newRecords.length, '条');
    return newRecords.length;
  }

  function deleteRecord(id) {
    state.records = state.records.filter((r) => r.id !== id);
    saveLocal();
    apiDelete(`/records/${id}`)
      .catch(err => console.error('[Store] 删除记录同步失败:', err));
  }

  // ============ 数据统计 ============
  function getStats() {
    return {
      branchCount: state.branches.length,
      memberCount: state.members.length,
      recordCount: state.records.length
    };
  }

  function getBranchStats(branchId) {
    return {
      memberCount: state.members.filter((m) => m.branchId === branchId).length,
      recordCount: state.records.filter((r) => r.branchId === branchId).length
    };
  }

  // ============ 数据导入导出 ============
  function exportData() {
    return JSON.stringify({ ...state, version: 'v2' }, null, 2);
  }

  function importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.branches || !Array.isArray(data.branches)) {
        return { success: false, error: '数据格式错误' };
      }
      state = {
        branches: data.branches,
        members: data.members || [],
        records: data.records || [],
        currentBranchId: data.currentBranchId || (data.branches[0] && data.branches[0].id) || null
      };
      saveLocal();
      // 异步同步到后端
      apiPost('/import', data)
        .then(() => console.log('[Store] 导入数据已同步到服务器'))
        .catch(err => console.error('[Store] 同步导入失败:', err));
      return { success: true };
    } catch (error) {
      return { success: false, error: 'JSON 解析失败' };
    }
  }

  async function clearAll() {
    try {
      await apiPost('/reset', {});
      // 重新从服务器加载
      const data = await apiGet('/export');
      state = {
        branches: data.branches || [],
        members: data.members || [],
        records: normalizeDurations(data.records || []),
        currentBranchId: (data.branches[0] && data.branches[0].id) || null
      };
      saveLocal();
    } catch (err) {
      console.error('[Store] 重置失败，使用本地降级:', err);
      // 降级：从 initial-data.js 重置
      if (window.INITIAL_DATA && window.INITIAL_DATA.branches) {
        state = {
          branches: window.INITIAL_DATA.branches,
          members: window.INITIAL_DATA.members || [],
          records: normalizeDurations(window.INITIAL_DATA.records || []),
          currentBranchId: window.INITIAL_DATA.branches[0]?.id || null
        };
        saveLocal();
      }
    }
  }

  // ============ 从 Excel 导入单个党支部 ============
  // payload: { mode: 'add'|'replace', branchName, replaceBranchId, members: [{name, joinDate}], records: [{memberName, trainingDate, methodAndContent, duration}] }
  function importBranchFromExcel(payload) {
    const { mode, branchName, replaceBranchId, members, records } = payload;

    if (mode === 'add') {
      const trimmed = (branchName || '').trim();
      if (!trimmed) return { success: false, error: '党支部名称不能为空' };
      if (state.branches.some(b => b.name === trimmed)) {
        return { success: false, error: `党支部「${trimmed}」已存在` };
      }
      const branch = { id: genId(), name: trimmed, createdAt: now() };
      state.branches.push(branch);
      if (!state.currentBranchId) state.currentBranchId = branch.id;

      // 创建党员（按姓名去重，建立 name -> id 映射）
      const nameToId = {};
      (members || []).forEach(m => {
        const mName = (m.name || '').trim();
        if (!mName) return;
        if (nameToId[mName]) return;  // 同名党员复用
        const mid = genId();
        state.members.push({
          id: mid, name: mName, branchId: branch.id,
          joinDate: m.joinDate || '', createdAt: now()
        });
        nameToId[mName] = mid;
      });

      // 创建培训记录
      (records || []).forEach(r => {
        const mid = nameToId[(r.memberName || '').trim()];
        if (!mid) return;  // 找不到对应党员，跳过
        state.records.push({
          id: genId(), memberId: mid, branchId: branch.id,
          trainingDate: r.trainingDate || '',
          methodAndContent: (r.methodAndContent || '').trim(),
          duration: (r.duration || '').trim(),
          createdAt: now()
        });
      });

      saveLocal();
      // 异步同步到后端
      apiPost('/branches/import', { mode: 'add', branchName: trimmed, members, records })
        .then(serverBranch => {
          if (serverBranch && serverBranch.id) {
            // 用服务器返回的 ID 替换临时 ID
            const oldBranchId = branch.id;
            const idx = state.branches.findIndex(b => b.id === oldBranchId);
            if (idx >= 0) {
              state.branches[idx] = { id: serverBranch.id, name: trimmed, createdAt: serverBranch.createdAt || now() };
              // 建立 旧memberId -> 新memberId 映射，并同步更换 branchId
              const oldToNewMemberId = {};
              state.members.forEach(m => {
                if (m.branchId === oldBranchId) {
                  m.branchId = serverBranch.id;
                  if (serverBranch.memberIdMap && serverBranch.memberIdMap[m.name]) {
                    oldToNewMemberId[m.id] = serverBranch.memberIdMap[m.name];
                    m.id = serverBranch.memberIdMap[m.name];
                  }
                }
              });
              // 同步更换 record 的 branchId 和 memberId
              state.records.forEach(r => {
                if (r.branchId === oldBranchId) {
                  r.branchId = serverBranch.id;
                  if (oldToNewMemberId[r.memberId]) {
                    r.memberId = oldToNewMemberId[r.memberId];
                  }
                }
              });
              if (state.currentBranchId === oldBranchId) state.currentBranchId = serverBranch.id;
              saveLocal();
            }
          }
          console.log('[Store] Excel 导入党支部已同步到服务器');
        })
        .catch(err => console.error('[Store] 同步 Excel 导入失败:', err));

      return {
        success: true,
        data: {
          branchId: branch.id,
          memberCount: Object.keys(nameToId).length,
          recordCount: (records || []).filter(r => nameToId[(r.memberName || '').trim()]).length
        }
      };
    }

    if (mode === 'replace') {
      if (!replaceBranchId) return { success: false, error: '请选择要替换的党支部' };
      const branch = state.branches.find(b => b.id === replaceBranchId);
      if (!branch) return { success: false, error: '未找到要替换的党支部' };

      // 删除该支部原有的党员和记录
      state.members = state.members.filter(m => m.branchId !== replaceBranchId);
      state.records = state.records.filter(r => r.branchId !== replaceBranchId);

      // 创建新党员
      const nameToId = {};
      (members || []).forEach(m => {
        const mName = (m.name || '').trim();
        if (!mName) return;
        if (nameToId[mName]) return;
        const mid = genId();
        state.members.push({
          id: mid, name: mName, branchId: replaceBranchId,
          joinDate: m.joinDate || '', createdAt: now()
        });
        nameToId[mName] = mid;
      });

      // 创建新记录
      (records || []).forEach(r => {
        const mid = nameToId[(r.memberName || '').trim()];
        if (!mid) return;
        state.records.push({
          id: genId(), memberId: mid, branchId: replaceBranchId,
          trainingDate: r.trainingDate || '',
          methodAndContent: (r.methodAndContent || '').trim(),
          duration: (r.duration || '').trim(),
          createdAt: now()
        });
      });

      saveLocal();
      // 异步同步到后端
      apiPost('/branches/import', { mode: 'replace', replaceBranchId, members, records })
        .then(() => console.log('[Store] Excel 替换党支部已同步到服务器'))
        .catch(err => console.error('[Store] 同步 Excel 替换失败:', err));

      return {
        success: true,
        data: {
          branchId: replaceBranchId,
          memberCount: Object.keys(nameToId).length,
          recordCount: (records || []).filter(r => nameToId[(r.memberName || '').trim()]).length
        }
      };
    }

    return { success: false, error: '未知的导入模式' };
  }

  return {
    init,
    getBranches, getBranch, getCurrentBranch, getCurrentBranchId, setCurrentBranch,
    addBranch, deleteBranch,
    getMembers, addMembers, deleteMember,
    getRecordsByMember, getRecordsByBranch, addTrainingRecords, deleteRecord,
    getStats, getBranchStats,
    exportData, importData, clearAll, importBranchFromExcel
  };
})();
