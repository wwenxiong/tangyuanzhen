/**
 * 前端应用主逻辑
 * 调用 Store（后端数据层）提供的 API，负责 UI 渲染和交互
 */
const App = (function () {
  // 当前视图状态
  const viewState = {
    currentView: 'table',        // table / branches / data
    selectedMemberIds: [],        // 添加培训时选中的党员
    searchKeyword: ''             // 搜索关键字
  };

  // ============ 工具函数 ============
  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(text, type = '') {
    const toast = $('#toast');
    toast.textContent = text;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
      toast.className = 'toast';
    }, 1800);
  }

  function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 确认对话框
  function confirmDialog(title, content, onConfirm, confirmText = '确认', isDanger = false) {
    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div style="font-size:14px;color:var(--color-text-secondary);text-align:center;margin-bottom:16px;line-height:1.6;">
          ${escapeHtml(content)}
        </div>
        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmText}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        modal.remove();
        onConfirm();
      }
    });
  }

  // 关闭所有弹窗
  function closeModal() {
    const mask = $('.modal-mask');
    if (mask) mask.remove();
  }

  // ============ 视图切换 ============
  function switchView(view) {
    viewState.currentView = view;
    $$('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    render();
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  // ============ 主渲染入口 ============
  function render() {
    const main = $('#appMain');
    switch (viewState.currentView) {
      case 'table':
        renderTableView(main);
        break;
      case 'branches':
        renderBranchesView(main);
        break;
      case 'data':
        renderDataView(main);
        break;
    }
  }

  // ============ 培训记录表格视图 ============
  function renderTableView(container) {
    const currentBranch = Store.getCurrentBranch();
    if (!currentBranch) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-text">请先选择或创建党支部</div>
          <button class="btn btn-primary" onclick="App.switchView('branches')">前往管理党支部</button>
        </div>
      `;
      return;
    }

    const branchStats = Store.getBranchStats(currentBranch.id);
    const branches = Store.getBranches();

    let html = `
      <!-- 党支部选择栏 -->
      <div class="branch-bar">
        <span class="branch-bar-label">当前党支部：</span>
        <select class="branch-select" onchange="App.onBranchChange(this.value)">
          ${branches.map(b => `
            <option value="${b.id}" ${b.id === currentBranch.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>
          `).join('')}
        </select>
        <div class="branch-stats">
          <span><b>${branchStats.memberCount}</b>名党员</span>
          <span><b>${branchStats.recordCount}</b>条培训记录</span>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-default" onclick="App.openAddMemberModal()">+ 添加党员</button>
          <button class="btn btn-primary" onclick="App.openAddTrainingModal()">+ 添加培训记录</button>
          <button class="btn btn-success" onclick="App.exportBranchExcel()">↓ 导出当前支部 Excel</button>
        </div>
        <div class="toolbar-right">
          <input class="search-input" type="text" placeholder="搜索党员姓名"
                 value="${escapeHtml(viewState.searchKeyword)}"
                 oninput="App.onSearch(this.value)">
        </div>
      </div>
    `;

    // 获取党员列表
    const members = Store.getMembers(currentBranch.id);
    const filteredMembers = viewState.searchKeyword.trim()
      ? members.filter(m => m.name.includes(viewState.searchKeyword.trim()))
      : members;

    if (filteredMembers.length === 0) {
      html += `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <div class="empty-text">${members.length === 0 ? '暂无党员，点击"添加党员"开始' : '未找到匹配的党员'}</div>
          </div>
        </div>
      `;
    } else {
      // 渲染每个党员的培训记录表格
      filteredMembers.forEach((member) => {
        const records = Store.getRecordsByMember(member.id);
        html += `
          <div class="table-wrap">
            <div class="table-title">
              <div class="member-cell">
                <div class="member-avatar">${escapeHtml(member.name.slice(0, 1))}</div>
                <span class="table-title-text">${escapeHtml(member.name)}</span>
              </div>
              <span class="table-title-meta">共 ${records.length} 条培训记录</span>
            </div>
            ${records.length === 0 ? `
              <div class="empty-state" style="padding:24px;">
                <div class="empty-text">暂无培训记录</div>
              </div>
            ` : `
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-index">序号</th>
                    <th class="col-date">参加培训时间</th>
                    <th>培训方式及内容</th>
                    <th class="col-duration">培训时长</th>
                    <th class="col-action">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map((r, idx) => `
                    <tr>
                      <td class="col-index">${idx + 1}</td>
                      <td class="col-date">${escapeHtml(r.trainingDate)}</td>
                      <td>${escapeHtml(r.methodAndContent)}</td>
                      <td class="col-duration"><span class="duration-tag">${escapeHtml(r.duration)}</span></td>
                      <td class="col-action">
                        <span class="delete-icon" onclick="App.deleteRecord('${r.id}')" title="删除">×</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  // ============ 党支部管理视图 ============
  function renderBranchesView(container) {
    const branches = Store.getBranches();
    const currentBranchId = Store.getCurrentBranchId();

    let html = `
      <div class="toolbar">
        <div class="toolbar-left">
          <h2 style="font-size:18px;font-weight:600;">党支部管理（共 ${branches.length} 个）</h2>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-success" onclick="App.openImportBranchExcelModal()">↑ 导入 Excel</button>
          <button class="btn btn-primary" onclick="App.openAddBranchModal()">+ 新建党支部</button>
        </div>
      </div>
      <div class="card-grid">
    `;

    if (branches.length === 0) {
      html += `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">📁</div>
          <div class="empty-text">暂无党支部，点击上方按钮新建</div>
        </div>
      `;
    } else {
      branches.forEach((branch) => {
        const stats = Store.getBranchStats(branch.id);
        const isActive = branch.id === currentBranchId;
        html += `
          <div class="branch-card ${isActive ? 'active' : ''}">
            ${isActive ? '<div class="active-tag">当前</div>' : ''}
            <div class="branch-card-header">
              <div class="branch-badge">${escapeHtml(branch.name.slice(0, 1))}</div>
              <div class="branch-name">${escapeHtml(branch.name)}</div>
            </div>
            <div class="branch-card-stats">
              <div class="branch-stat">
                <span class="branch-stat-num">${stats.memberCount}</span>
                <span class="branch-stat-label">党员</span>
              </div>
              <div class="branch-stat">
                <span class="branch-stat-num">${stats.recordCount}</span>
                <span class="branch-stat-label">培训记录</span>
              </div>
            </div>
            <div class="branch-card-actions">
              <button class="btn btn-primary btn-sm" onclick="App.selectBranch('${branch.id}')">查看</button>
              <button class="btn btn-danger btn-sm" onclick="App.deleteBranch('${branch.id}')">删除</button>
            </div>
          </div>
        `;
      });
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ============ 数据管理视图 ============
  function renderDataView(container) {
    const stats = Store.getStats();
    container.innerHTML = `
      <div class="stats-cards">
        <div class="stats-card">
          <span class="stats-card-num">${stats.branchCount}</span>
          <span class="stats-card-label">党支部数量</span>
        </div>
        <div class="stats-card">
          <span class="stats-card-num">${stats.memberCount}</span>
          <span class="stats-card-label">党员总数</span>
        </div>
        <div class="stats-card">
          <span class="stats-card-num">${stats.recordCount}</span>
          <span class="stats-card-label">培训记录总数</span>
        </div>
      </div>

      <div class="section-title">数据管理</div>
      <div class="section-desc">
        数据自动保存在浏览器本地（localStorage），关闭网页后数据不会丢失，可重复使用。可通过导出备份，或导入恢复数据。
      </div>
      <div class="action-list">
        <div class="action-item" onclick="App.exportData()">
          <div class="action-item-info">
            <div class="action-item-title">导出数据</div>
            <div class="action-item-desc">将所有数据导出到剪贴板，可粘贴保存为文件备份</div>
          </div>
          <span class="action-arrow">›</span>
        </div>
        <div class="action-item" onclick="App.openImportModal()">
          <div class="action-item-info">
            <div class="action-item-title">导入数据</div>
            <div class="action-item-desc">从备份的 JSON 数据恢复，会覆盖当前数据</div>
          </div>
          <span class="action-arrow">›</span>
        </div>
        <div class="action-item" onclick="App.clearAllData()">
          <div class="action-item-info">
            <div class="action-item-title danger">重置数据</div>
            <div class="action-item-desc">清除所有党员和培训记录，恢复初始党支部</div>
          </div>
          <span class="action-arrow">›</span>
        </div>
      </div>

      <div class="section-title">关于</div>
      <div class="action-list">
        <div class="action-item">
          <div class="action-item-info">
            <div class="action-item-title">党员培训记录管理系统 v1.0</div>
            <div class="action-item-desc">汤原镇党员培训记录管理网页应用 · 前后端分离架构 · 数据本地持久化</div>
          </div>
        </div>
      </div>
    `;
  }

  // ============ 事件处理 ============
  function onBranchChange(branchId) {
    Store.setCurrentBranch(branchId);
    render();
  }

  function onSearch(value) {
    viewState.searchKeyword = value;
    render();
    // 恢复焦点
    const input = $('.search-input');
    if (input) {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
  }

  function selectBranch(branchId) {
    Store.setCurrentBranch(branchId);
    switchView('table');
    showToast('已切换党支部');
  }

  // ============ 党支部操作 ============
  function openAddBranchModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">新建党支部</div>
        <div class="form-item">
          <label class="form-label">党支部名称</label>
          <input class="form-input" id="branchNameInput" placeholder="请输入党支部名称" autofocus>
        </div>
        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn btn-primary" data-action="confirm">确认创建</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => $('#branchNameInput').focus(), 50);

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        const name = $('#branchNameInput').value.trim();
        if (!name) {
          showToast('请输入党支部名称', 'error');
          return;
        }
        const result = Store.addBranch(name);
        if (result.success) {
          modal.remove();
          render();
          showToast('党支部创建成功', 'success');
        } else {
          showToast(result.error, 'error');
        }
      }
    });
  }

  function deleteBranch(id) {
    const branch = Store.getBranch(id);
    if (!branch) return;
    confirmDialog(
      '确认删除',
      `删除「${branch.name}」党支部将同时删除其所有党员和培训记录，此操作不可撤销。`,
      () => {
        Store.deleteBranch(id);
        render();
        showToast('党支部已删除', 'success');
      },
      '确认删除',
      true
    );
  }

  // ============ 从 Excel 导入党支部 ============
  // 当前正在编辑的导入数据（暂存解析结果）
  let pendingImportData = null;

  function openImportBranchExcelModal() {
    pendingImportData = null;
    const branches = Store.getBranches();

    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-title">从 Excel 导入党支部</div>
        <div class="modal-tip">支持 .xlsx / .xls 格式。表结构需与导出格式一致（前3行为标题/填报单位/表头，第4行起为数据）。</div>

        <div class="form-item">
          <label class="form-label">导入方式</label>
          <div class="radio-group" id="importModeGroup">
            <label class="radio-item">
              <input type="radio" name="importMode" value="add" checked onchange="App.onImportModeChange()">
              <span>新建党支部</span>
            </label>
            <label class="radio-item">
              <input type="radio" name="importMode" value="replace" onchange="App.onImportModeChange()">
              <span>替换已有党支部</span>
            </label>
          </div>
        </div>

        <div class="form-item" id="replaceBranchRow" style="display:none;">
          <label class="form-label">选择要替换的党支部</label>
          <select class="form-select" id="replaceBranchSelect">
            ${branches.map(b => `<option value="${b.id}">${escapeHtml(b.name)}（${Store.getBranchStats(b.id).memberCount}人 / ${Store.getBranchStats(b.id).recordCount}条）</option>`).join('')}
          </select>
          <div class="form-hint" style="color:var(--color-error);">替换后将清空该党支部原有的所有党员和培训记录，请谨慎操作。</div>
        </div>

        <div class="form-item" id="branchNameRow">
          <label class="form-label">党支部名称</label>
          <input class="form-input" id="branchNameInput" placeholder="选择 Excel 后自动填充，可手动修改">
        </div>

        <div class="form-item">
          <label class="form-label">选择 Excel 文件</label>
          <input type="file" id="excelFileInput" accept=".xlsx,.xls" onchange="App.onExcelFileSelected(this)" style="width:100%;">
        </div>

        <div id="importPreview" style="display:none;"></div>

        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn btn-primary" data-action="confirm" id="confirmImportBtn" disabled>确认导入</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        submitBranchExcelImport();
      }
    });
  }

  function onImportModeChange() {
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    const replaceRow = $('#replaceBranchRow');
    const branchNameRow = $('#branchNameRow');
    if (mode === 'replace') {
      replaceRow.style.display = '';
      branchNameRow.style.display = 'none';
    } else {
      replaceRow.style.display = 'none';
      branchNameRow.style.display = '';
    }
    updateImportPreview();
  }

  function onExcelFileSelected(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const parsed = parseBranchExcelWorkbook(wb);
        if (!parsed) {
          showToast('无法解析 Excel 文件', 'error');
          resetImportPreview();
          return;
        }
        pendingImportData = parsed;
        // 自动填充党支部名称（仅 add 模式）
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        if (mode === 'add') {
          $('#branchNameInput').value = parsed.branchName || '';
        }
        updateImportPreview();
        showToast(`已解析：${parsed.members.length} 名党员，${parsed.records.length} 条记录`, 'success');
      } catch (err) {
        console.error('[Import] Excel 解析失败:', err);
        showToast('Excel 解析失败：' + err.message, 'error');
        resetImportPreview();
      }
    };
    reader.onerror = () => showToast('文件读取失败', 'error');
    reader.readAsArrayBuffer(file);
  }

  function resetImportPreview() {
    pendingImportData = null;
    const preview = $('#importPreview');
    if (preview) preview.style.display = 'none';
    const btn = $('#confirmImportBtn');
    if (btn) btn.disabled = true;
  }

  function updateImportPreview() {
    const preview = $('#importPreview');
    const btn = $('#confirmImportBtn');
    if (!pendingImportData || !pendingImportData.members) {
      if (preview) preview.style.display = 'none';
      if (btn) btn.disabled = true;
      return;
    }
    if (preview) {
      preview.style.display = '';
      preview.innerHTML = `
        <div class="import-preview-box">
          <div class="import-preview-title">解析结果预览</div>
          <div class="import-preview-row"><span>识别党支部名称：</span><b>${escapeHtml(pendingImportData.branchName || '（未识别）')}</b></div>
          <div class="import-preview-row"><span>党员数量：</span><b>${pendingImportData.members.length} 名</b></div>
          <div class="import-preview-row"><span>培训记录数量：</span><b>${pendingImportData.records.length} 条</b></div>
          ${pendingImportData.members.length > 0 ? `
            <div class="import-preview-row" style="flex-direction:column;align-items:flex-start;">
              <span>党员名单（前 10 名）：</span>
              <div class="import-preview-names">${pendingImportData.members.slice(0, 10).map(m => `<span class="name-chip">${escapeHtml(m.name)}</span>`).join('')}${pendingImportData.members.length > 10 ? `<span class="name-chip name-chip-more">等 ${pendingImportData.members.length} 人</span>` : ''}</div>
            </div>
          ` : ''}
        </div>
      `;
    }
    if (btn) btn.disabled = false;
  }

  function submitBranchExcelImport() {
    if (!pendingImportData) {
      showToast('请先选择 Excel 文件', 'error');
      return;
    }
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    let branchName = '';
    let replaceBranchId = '';

    if (mode === 'add') {
      branchName = $('#branchNameInput').value.trim();
      if (!branchName) {
        showToast('请填写党支部名称', 'error');
        return;
      }
    } else {
      replaceBranchId = $('#replaceBranchSelect').value;
      if (!replaceBranchId) {
        showToast('请选择要替换的党支部', 'error');
        return;
      }
    }

    const doImport = () => {
      const result = Store.importBranchFromExcel({
        mode,
        branchName,
        replaceBranchId,
        members: pendingImportData.members,
        records: pendingImportData.records
      });
      if (result.success) {
        closeModal();
        // 切换到导入的党支部
        Store.setCurrentBranch(result.data.branchId);
        render();
        showToast(`导入成功：${result.data.memberCount} 名党员，${result.data.recordCount} 条培训记录`, 'success');
      } else {
        showToast(result.error, 'error');
      }
    };

    if (mode === 'replace') {
      const branch = Store.getBranch(replaceBranchId);
      confirmDialog(
        '确认替换',
        `替换「${branch.name}」党支部将清空其原有所有党员和培训记录，并用 Excel 中的数据替换。此操作不可撤销。`,
        doImport,
        '确认替换',
        true
      );
    } else {
      doImport();
    }
  }

  // 解析 Excel 工作簿为 { branchName, members: [{name, joinDate}], records: [{memberName, trainingDate, methodAndContent, duration}] }
  function parseBranchExcelWorkbook(wb) {
    if (!wb.SheetNames || wb.SheetNames.length === 0) return null;
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // header:1 返回二维数组；raw:false 让单元格按格式化文本输出；defval 填充空单元格
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true });
    if (!rows || rows.length < 3) return null;

    // 提取党支部名称：优先从第2行 "填报单位：xxx" 提取
    let branchName = '';
    if (rows[1] && rows[1][0] != null) {
      const m = String(rows[1][0]).match(/填报单位[：:]\s*([^\s]+)/);
      if (m) branchName = m[1].trim();
    }
    // 兜底：从标题行第1行提取 "xxx村党支部"
    if (!branchName && rows[0] && rows[0][0] != null) {
      const m = String(rows[0][0]).match(/^(.+?)村党支部/);
      if (m) branchName = m[1].trim();
    }
    // 再兜底：用工作表名
    if (!branchName) branchName = wb.SheetNames[0].trim();

    const members = [];
    const records = [];
    const nameToIdx = {};
    let currentMemberIdx = -1;

    // 从第4行（索引3）开始解析数据
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i] || [];
      const idx = row[0];
      const name = row[1];
      const joinDate = row[2];
      const trainDate = row[3];
      const content = row[4];
      const duration = row[5];
      // 总学时在第7列（row[6]），不读取

      // 跳过完全空白的行
      const allEmpty = [idx, name, joinDate, trainDate, content, duration].every(v =>
        v === '' || v === null || v === undefined
      );
      if (allEmpty) continue;

      // 跳过合计行
      const nameStr = String(name || '').trim();
      if (nameStr && /合计|总计|平均/.test(nameStr)) continue;
      if (!idx && !name && !trainDate && !content) continue;

      const idxStr = String(idx || '').trim();
      // 新党员检测：序号有非零非空值，或姓名有非空值
      const hasIdx = idx !== '' && idx !== null && idx !== undefined && idxStr !== '' && idxStr !== '0';
      const hasName = nameStr !== '';
      if (hasIdx || hasName) {
        if (!nameStr) continue;
        if (!(nameStr in nameToIdx)) {
          nameToIdx[nameStr] = members.length;
          members.push({
            name: nameStr,
            joinDate: normalizeExcelDate(joinDate)
          });
        }
        currentMemberIdx = nameToIdx[nameStr];
      }

      // 添加培训记录
      const td = normalizeExcelDate(trainDate);
      const ct = String(content || '').trim();
      if (currentMemberIdx >= 0 && td && ct && !String(trainDate).trim().startsWith('=')) {
        const member = members[currentMemberIdx];
        records.push({
          memberName: member.name,
          trainingDate: td,
          methodAndContent: ct,
          duration: normalizeExcelDuration(duration)
        });
      }
    }

    return { branchName, members, records };
  }

  // 统一 Excel 日期格式为 YYYY-MM-DD 或 YYYY-MM
  function normalizeExcelDate(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    // Date 对象（cellDates:true 时 SheetJS 会把日期单元格转为 Date）
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const d = String(raw.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    let s = String(raw).trim();
    if (!s) return '';
    // 2026.01.17
    let m = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    // 2026.01（只有年月）
    m = s.match(/^(\d{4})\.(\d{1,2})$/);
    if (m) return `${m[1]}-${pad2(m[2])}`;
    // 2026-01-17 / 2026-1-7
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    // 2026/01/17
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    return s;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // 统一培训时长为 "X学时" 字符串
  function normalizeExcelDuration(raw) {
    if (raw === null || raw === undefined || raw === '') return '';
    if (typeof raw === 'number') {
      return (Number.isInteger(raw) ? raw : raw) + '学时';
    }
    let s = String(raw).trim();
    if (!s) return '';
    if (s.startsWith('=')) return '';  // 跳过公式
    if (s.endsWith('学时') || s.endsWith('小时')) return s;
    // 纯数字
    if (/^[\d.]+$/.test(s)) {
      const num = parseFloat(s);
      if (!isNaN(num)) return num + '学时';
    }
    return s + '学时';
  }

  // ============ 党员操作 ============
  function openAddMemberModal() {
    const currentBranch = Store.getCurrentBranch();
    if (!currentBranch) {
      showToast('请先选择党支部', 'error');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-title">添加党员到「${escapeHtml(currentBranch.name)}」</div>
        <div class="modal-tip">多个姓名可用逗号、顿号或换行分隔，如：张三，李四，王五</div>
        <div class="form-item">
          <label class="form-label">党员姓名</label>
          <textarea class="form-textarea" id="memberNamesInput" placeholder="请输入党员姓名" rows="4"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn btn-primary" data-action="confirm">确认添加</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => $('#memberNamesInput').focus(), 50);

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        const text = $('#memberNamesInput').value;
        const names = text.split(/[,，、\n\s]+/).filter(n => n.trim());
        if (names.length === 0) {
          showToast('请输入党员姓名', 'error');
          return;
        }
        const count = Store.addMembers(names, currentBranch.id);
        modal.remove();
        render();
        showToast(`已添加 ${count} 名党员`, 'success');
      }
    });
  }

  function deleteMember(id) {
    const member = Store.getMembers(Store.getCurrentBranchId()).find(m => m.id === id);
    if (!member) return;
    confirmDialog(
      '确认删除',
      `删除党员「${member.name}」将同时删除其所有培训记录，此操作不可撤销。`,
      () => {
        Store.deleteMember(id);
        render();
        showToast('党员已删除', 'success');
      },
      '确认删除',
      true
    );
  }

  // ============ 培训记录操作 ============
  function openAddTrainingModal() {
    const currentBranch = Store.getCurrentBranch();
    if (!currentBranch) {
      showToast('请先选择党支部', 'error');
      return;
    }

    const members = Store.getMembers(currentBranch.id);
    if (members.length === 0) {
      showToast('请先添加党员', 'error');
      return;
    }

    viewState.selectedMemberIds = [];

    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-title">添加培训记录</div>
        <div class="modal-tip">为「${escapeHtml(currentBranch.name)}」党支部的党员添加培训记录，可多选党员</div>

        <div class="form-item">
          <div class="select-toolbar">
            <span>选择党员（已选 <b id="selectedCount">0</b> / ${members.length} 人）</span>
            <div>
              <button class="btn btn-default btn-sm" onclick="App.selectAllMembers(true)">全选</button>
              <button class="btn btn-default btn-sm" onclick="App.selectAllMembers(false)">清空</button>
            </div>
          </div>
          <div class="member-select-list" id="memberList">
            ${members.map(m => {
              const count = Store.getRecordsByMember(m.id).length;
              return `
                <div class="member-select-item" data-id="${m.id}" onclick="App.toggleMember('${m.id}')">
                  <div class="checkbox"><span class="checkbox-icon">✓</span></div>
                  <span class="member-select-name">${escapeHtml(m.name)}</span>
                  <span class="member-select-count">${count} 条记录</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="form-item">
          <label class="form-label">参加培训时间</label>
          <input class="form-input" type="date" id="trainingDateInput" value="${today()}">
        </div>

        <div class="form-item">
          <label class="form-label">培训方式及内容</label>
          <textarea class="form-textarea" id="contentInput" placeholder="请输入培训方式及内容，如：集中学习《党章》" rows="3"></textarea>
        </div>

        <div class="form-item">
          <label class="form-label">培训时长（学时）</label>
          <div class="duration-input-group">
            <input class="form-input" type="number" id="durationInput" placeholder="如：2" step="1" min="0" oninput="this.value=this.value.replace(/[^0-9]/g,'')">
            <span class="duration-unit">学时</span>
          </div>
          <div class="form-hint">只能输入整数，45分钟 = 1学时</div>
        </div>

        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn btn-primary" data-action="confirm">确认添加</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        submitTraining();
      }
    });
  }

  function toggleMember(id) {
    const idx = viewState.selectedMemberIds.indexOf(id);
    if (idx >= 0) {
      viewState.selectedMemberIds.splice(idx, 1);
    } else {
      viewState.selectedMemberIds.push(id);
    }
    // 更新UI
    const item = document.querySelector(`.member-select-item[data-id="${id}"]`);
    if (item) {
      item.classList.toggle('selected', viewState.selectedMemberIds.includes(id));
    }
    const countEl = $('#selectedCount');
    if (countEl) countEl.textContent = viewState.selectedMemberIds.length;
  }

  function selectAllMembers(select) {
    const currentBranch = Store.getCurrentBranch();
    if (!currentBranch) return;
    const members = Store.getMembers(currentBranch.id);
    if (select) {
      viewState.selectedMemberIds = members.map(m => m.id);
    } else {
      viewState.selectedMemberIds = [];
    }
    $$('.member-select-item').forEach(item => {
      const id = item.dataset.id;
      item.classList.toggle('selected', viewState.selectedMemberIds.includes(id));
    });
    const countEl = $('#selectedCount');
    if (countEl) countEl.textContent = viewState.selectedMemberIds.length;
  }

  function submitTraining() {
    if (viewState.selectedMemberIds.length === 0) {
      showToast('请至少选择一名党员', 'error');
      return;
    }
    const trainingDate = $('#trainingDateInput').value;
    const methodAndContent = $('#contentInput').value;
    const durationRaw = $('#durationInput').value;

    if (!trainingDate) {
      showToast('请选择培训时间', 'error');
      return;
    }
    if (!methodAndContent.trim()) {
      showToast('请填写培训方式及内容', 'error');
      return;
    }
    if (!durationRaw || isNaN(parseInt(durationRaw)) || parseInt(durationRaw) != parseFloat(durationRaw) || parseInt(durationRaw) < 0) {
      showToast('请填写培训时长（只能输入整数）', 'error');
      return;
    }

    // 统一为课时格式：整数 + "学时"
    const durationNum = parseInt(durationRaw);
    const duration = durationNum + '学时';

    const count = Store.addTrainingRecords({
      memberIds: viewState.selectedMemberIds,
      trainingDate,
      methodAndContent,
      duration
    });

    closeModal();
    viewState.selectedMemberIds = [];
    render();
    showToast(`已为 ${count} 名党员添加培训记录`, 'success');
  }

  function deleteRecord(id) {
    confirmDialog(
      '确认删除',
      '确认删除这条培训记录？',
      () => {
        Store.deleteRecord(id);
        render();
        showToast('记录已删除', 'success');
      },
      '确认删除',
      true
    );
  }

  // ============ xlsx 带样式导出辅助函数 ============

  // CRC-32 计算
  function crc32(data) {
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ZIP打包（STORE方法，无压缩）
  function createZipStore(files) {
    const enc = new TextEncoder();
    const parts = [];
    const centralDir = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const dataBytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(dataBytes);
      const size = dataBytes.length;
      const lh = new Uint8Array(30);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x21, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
      parts.push(lh, nameBytes, dataBytes);
      const cd = new Uint8Array(46);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true); cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
      centralDir.push(cd, nameBytes);
      offset += 30 + nameBytes.length + size;
    }
    const cdSize = centralDir.reduce(function (s, a) { return s + a.length; }, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    const all = parts.concat(centralDir, [eocd]);
    const total = all.reduce(function (s, a) { return s + a.length; }, 0);
    const result = new Uint8Array(total);
    let pos = 0;
    for (const p of all) { result.set(p, pos); pos += p.length; }
    return result;
  }

  // 构建带框线样式的xlsx文件，返回Uint8Array
  function buildStyledXlsx(branchName, rows) {
    const xesc = xmlEscape;
    const colWidths = [4.875, 10.625, 10.625, 15.625, 52.875, 29, 9.375];

    // ---- 构建 sheet1.xml ----
    let sx = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    sx += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    sx += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    sx += '<cols>';
    colWidths.forEach(function (w, i) { sx += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
    sx += '</cols>';
    sx += '<sheetData>';

    // 行1：标题
    sx += '<row r="1" ht="50" customHeight="1">';
    sx += '<c r="A1" s="1" t="inlineStr"><is><t>' + xesc(branchName) + '村党支部2026年度党员学习统计表</t></is></c>';
    for (var c = 1; c < 7; c++) { sx += '<c r="' + String.fromCharCode(65 + c) + '1" s="1"/>'; }
    sx += '</row>';

    // 行2：填报单位
    sx += '<row r="2" ht="30" customHeight="1">';
    sx += '<c r="A2" s="2" t="inlineStr"><is><t>填报单位：</t></is></c>';
    for (var c = 1; c < 7; c++) { sx += '<c r="' + String.fromCharCode(65 + c) + '2" s="2"/>'; }
    sx += '</row>';

    // 行3：表头
    var headers = ['序号', '姓名', '入党时间', '参加培训时间', '培训方式及内容', '培训时长（45分钟=1学时）', '总学时'];
    sx += '<row r="3" ht="30" customHeight="1">';
    headers.forEach(function (h, i) { sx += '<c r="' + String.fromCharCode(65 + i) + '3" s="3" t="inlineStr"><is><t>' + xesc(h) + '</t></is></c>'; });
    sx += '</row>';

    // 预计算F列数字值
    var fNumericValues = rows.map(function (r) {
      var durStr = (r.duration || '').toString();
      var m = durStr.match(/^([\d.]+)(?:学时)?$/);
      return m ? parseFloat(m[1]) : NaN;
    });

    var excelRow = 4;
    var mergeList = [];

    rows.forEach(function (r, rowIdx) {
      var isFirst = r._isFirst;
      var recordCount = r._recordCount || 0;
      sx += '<row r="' + excelRow + '">';

      // A列：序号
      if (isFirst && r.seq !== '') { sx += '<c r="A' + excelRow + '" s="4"><v>' + r.seq + '</v></c>'; }
      else { sx += '<c r="A' + excelRow + '" s="4"/>'; }

      // B列：姓名
      if (isFirst && r.name) { sx += '<c r="B' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(r.name) + '</t></is></c>'; }
      else { sx += '<c r="B' + excelRow + '" s="4"/>'; }

      // C列：入党时间 (YYYY.MM.DD 点号格式，与东大桥一致)
      if (isFirst && r.joinDate) {
        var jd = r.joinDate;
        var jm = jd.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
        if (jm) { jd = jm[3] ? jm[0].slice(0, 4) + '.' + String(jm[2]).padStart(2, '0') + '.' + String(jm[3]).padStart(2, '0') : jm[0].slice(0, 4) + '.' + String(jm[2]).padStart(2, '0'); }
        sx += '<c r="C' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(jd) + '</t></is></c>';
      } else { sx += '<c r="C' + excelRow + '" s="4"/>'; }

      // D列：参加培训时间 (YYYY.MM.DD)
      var td = r.trainDate || '';
      if (td) {
        var tm = td.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
        if (tm) { td = tm[3] ? tm[0].slice(0, 4) + '.' + String(tm[2]).padStart(2, '0') + '.' + String(tm[3]).padStart(2, '0') : tm[0].slice(0, 4) + '.' + String(tm[2]).padStart(2, '0'); }
        sx += '<c r="D' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(td) + '</t></is></c>';
      } else { sx += '<c r="D' + excelRow + '" s="4"/>'; }

      // E列：培训方式及内容（左对齐）
      if (r.content) { sx += '<c r="E' + excelRow + '" s="5" t="inlineStr"><is><t>' + xesc(r.content) + '</t></is></c>'; }
      else { sx += '<c r="E' + excelRow + '" s="5"/>'; }

      // F列：培训时长
      var durStr = (r.duration || '').toString();
      var pureNumMatch = durStr.match(/^([\d.]+)(?:学时)?$/);
      if (!durStr) { sx += '<c r="F' + excelRow + '" s="4"/>'; }
      else if (pureNumMatch) { sx += '<c r="F' + excelRow + '" s="4"><v>' + parseFloat(pureNumMatch[1]) + '</v></c>'; }
      else { sx += '<c r="F' + excelRow + '" s="4" t="inlineStr"><is><t>' + xesc(durStr) + '</t></is></c>'; }

      // G列：总学时（首行SUM公式）
      if (isFirst) {
        if (recordCount <= 1) {
          var gv = 0;
          if (recordCount === 1) { var fn = fNumericValues[rowIdx]; if (!isNaN(fn)) gv = fn; }
          sx += '<c r="G' + excelRow + '" s="6"><v>' + gv + '</v></c>';
        } else {
          var startR = excelRow, endR = excelRow + recordCount - 1;
          var cachedSum = 0;
          for (var i = rowIdx; i < rowIdx + recordCount && i < fNumericValues.length; i++) { var fn2 = fNumericValues[i]; if (!isNaN(fn2)) cachedSum += fn2; }
          cachedSum = cachedSum % 1 === 0 ? cachedSum : parseFloat(cachedSum.toFixed(2));
          sx += '<c r="G' + excelRow + '" s="6"><f>SUM(F' + startR + ':F' + endR + ')</f><v>' + cachedSum + '</v></c>';
        }
      } else { sx += '<c r="G' + excelRow + '" s="6"/>'; }

      sx += '</row>';

      // 合并单元格
      if (isFirst) {
        var mc = recordCount > 0 ? recordCount : 1;
        if (mc > 1) {
          mergeList.push('A' + excelRow + ':A' + (excelRow + mc - 1));
          mergeList.push('B' + excelRow + ':B' + (excelRow + mc - 1));
          mergeList.push('C' + excelRow + ':C' + (excelRow + mc - 1));
          mergeList.push('G' + excelRow + ':G' + (excelRow + mc - 1));
        }
      }
      excelRow++;
    });

    sx += '</sheetData>';
    // 合并单元格
    sx += '<mergeCells count="' + (mergeList.length + 2) + '">';
    sx += '<mergeCell ref="A1:G1"/>';
    sx += '<mergeCell ref="A2:D2"/>';
    mergeList.forEach(function (ref) { sx += '<mergeCell ref="' + ref + '"/>'; });
    sx += '</mergeCells>';
    sx += '</worksheet>';

    // ---- 构建 styles.xml（带框线） ----
    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="3">'
      + '<font><sz val="11"/><name val="宋体"/></font>'
      + '<font><b/><sz val="22"/><name val="宋体"/></font>'
      + '<font><b/><sz val="11"/><name val="宋体"/></font>'
      + '</fonts>'
      + '<fills count="3">'
      + '<fill><patternFill patternType="none"/></fill>'
      + '<fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill>'
      + '</fills>'
      + '<borders count="2">'
      + '<border><left/><right/><top/><bottom/><diagonal/></border>'
      + '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'
      + '</borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="7">'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
      + '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
      + '</cellXfs>'
      + '</styleSheet>';

    // ---- 其他XML文件 ----
    var contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>';

    var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>';

    var workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<sheets><sheet name="' + xesc(branchName.slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets>'
      + '</workbook>';

    var workbookRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>';

    // ---- 打包为ZIP ----
    return createZipStore([
      { name: '[Content_Types].xml', data: contentTypesXml },
      { name: '_rels/.rels', data: relsXml },
      { name: 'xl/workbook.xml', data: workbookXml },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
      { name: 'xl/styles.xml', data: stylesXml },
      { name: 'xl/worksheets/sheet1.xml', data: sx }
    ]);
  }

  // ============ 数据导入导出 ============
  // ============ 导出当前党支部为 Excel ============
  function exportBranchExcel() {
    const branch = Store.getCurrentBranch();
    if (!branch) {
      showToast('请先选择党支部', 'error');
      return;
    }
    const members = Store.getMembers(branch.id);
    if (members.length === 0) {
      showToast('当前党支部暂无党员数据', 'error');
      return;
    }

    // 构建数据行：每个党员一个块，块内多条培训记录
    // 列结构：序号 | 姓名 | 入党时间 | 参加培训时间 | 培训方式及内容 | 培训时长 | 总学时
    const rows = [];
    let memberIndex = 0;
    members.forEach((member) => {
      memberIndex++;
      const records = Store.getRecordsByMember(member.id);
      if (records.length === 0) {
        rows.push({
          seq: memberIndex,
          name: member.name,
          joinDate: member.joinDate || '',
          trainDate: '',
          content: '',
          duration: '',
          totalHours: 0,
          _isFirst: true,
          _isLast: true,
          _recordCount: 0
        });
      } else {
        records.forEach((r, idx) => {
          rows.push({
            seq: idx === 0 ? memberIndex : '',
            name: idx === 0 ? member.name : '',
            joinDate: idx === 0 ? (member.joinDate || '') : '',
            trainDate: r.trainingDate || '',
            content: r.methodAndContent || '',
            duration: r.duration || '',
            totalHours: idx === records.length - 1 ? sumDuration(records) : '',
            _memberIndex: memberIndex,
            _isFirst: idx === 0,
            _isLast: idx === records.length - 1,
            _recordCount: records.length
          });
        });
      }
    });

    const totalRows = rows.length;
    const lastRowNum = 3 + totalRows; // 3行表头 + 数据行
    const safeName = branch.name.replace(/[\\/:*?"<>|]/g, '_');

    // 使用手动构建的xlsx（带框线样式，参考东大桥格式）
    const xlsxData = buildStyledXlsx(branch.name, rows);
    const blob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`已导出「${branch.name}」${members.length}名党员数据`, 'success');
  }

  // 计算党员总学时
  function sumDuration(records) {
    let total = 0;
    records.forEach(r => {
      const m = (r.duration || '').toString().match(/[\d.]+/);
      if (m) total += parseFloat(m[0]);
    });
    return total % 1 === 0 ? total : parseFloat(total.toFixed(2));
  }

  // 转义XML特殊字符
  function xmlEscape(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '&#10;');
  }

  // 构建 SpreadsheetML XML（格式与原表一致）
  function buildExcelXml(branchName, rows, lastRowNum) {
    const cols = [
      { width: 48, cap: 'A' },   // 序号
      { width: 106, cap: 'B' },  // 姓名
      { width: 130, cap: 'C' },  // 入党时间
      { width: 156, cap: 'D' },  // 参加培训时间
      { width: 528, cap: 'E' },  // 培训方式及内容
      { width: 290, cap: 'F' },  // 培训时长
      { width: 93, cap: 'G' }   // 总学时
    ];

    // 收集合并区域（仅用于参考，实际通过 ss:MergeDown 实现）

    // 生成单元格
    let cells = '';
    // 第1行：标题（合并A1:G1）
    cells += `
    <Row ss:Height="50" ss:StyleID="TitleStyle">
      <Cell ss:MergeAcross="6" ss:StyleID="TitleStyle"><Data ss:Type="String">${xmlEscape(branchName)}村党支部2026年度党员学习统计表</Data></Cell>
    </Row>`;
    // 第2行：填报单位（合并A2:D2，与原始xlsx完全一致）
    cells += `
    <Row ss:Height="30" ss:StyleID="SubTitleStyle">
      <Cell ss:MergeAcross="3" ss:StyleID="SubTitleStyle"><Data ss:Type="String">填报单位：</Data></Cell>
    </Row>`;
    // 第3行：表头
    const headers = ['序号', '姓名', '入党时间', '参加培训时间', '培训方式及内容', '培训时长（45分钟=1学时）', '总学时'];
    cells += `
    <Row ss:Height="30" ss:StyleID="HeaderStyle">
      ${headers.map(h => `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join('')}
    </Row>`;

    // 列定义
    const colDefs = cols.map(c =>
      `<Column ss:AutoFitWidth="0" ss:Width="${c.width}"/>`
    ).join('\n      ');

    // 预先计算每一行F列的数字值（用于SUM公式缓存值）
    const fNumericValues = rows.map((r) => {
      const durStr = (r.duration || '').toString();
      const m = durStr.match(/^([\d.]+)(?:学时)?$/);
      return m ? parseFloat(m[1]) : NaN;
    });

    // 逐行生成数据（MergeDown 仅加在党员块首行的合并列上）
    rows.forEach((r, idx) => {
      const rowNum = 4 + idx;
      const isFirst = r._isFirst;
      const recordCount = r._recordCount || 0;
      let mergeDown = 0;
      if (isFirst) {
        const mergeCount = recordCount > 0 ? recordCount : 1; // 无记录至少合并1行
        if (mergeCount > 1) mergeDown = mergeCount - 1;
      }
      const mdAttr = mergeDown > 0 ? ` ss:MergeDown="${mergeDown}"` : '';

      // F列：纯数字/数字+学时 → Number；其他文本（如"4学时"等非纯数字）→ String原样；空→空
      // 与原始xlsx一致：如"4学时"保留为字符串（SUM自动跳过）
      const durStr = (r.duration || '').toString();
      const pureNumMatch = durStr.match(/^([\d.]+)(?:学时)?$/);
      let durationCell;
      if (!durStr) {
        durationCell = `<Cell ss:StyleID="DurationStyle"></Cell>`;
      } else if (pureNumMatch) {
        durationCell = `<Cell ss:StyleID="DurationStyle"><Data ss:Type="Number">${parseFloat(pureNumMatch[1])}</Data></Cell>`;
      } else {
        durationCell = `<Cell ss:StyleID="DurationStyle"><Data ss:Type="String">${xmlEscape(durStr)}</Data></Cell>`;
      }

      // 总学时：首行用 ss:Formula 写 SUM 公式；单条/无记录直接写数字
      // 缓存值：只累加F列纯数字值（跳过文本）
      let totalCell = '';
      if (isFirst && recordCount > 1) {
        const startRow = rowNum;
        const endRow = rowNum + recordCount - 1;
        let cachedSum = 0;
        for (let i = idx; i < idx + recordCount && i < fNumericValues.length; i++) {
          const fn = fNumericValues[i];
          if (!isNaN(fn)) cachedSum += fn;
        }
        cachedSum = cachedSum % 1 === 0 ? cachedSum : parseFloat(cachedSum.toFixed(2));
        totalCell = `<Cell${mdAttr} ss:StyleID="TotalStyle" ss:Formula="SUM(R${startRow}C6:R${endRow}C6)"><Data ss:Type="Number">${cachedSum}</Data></Cell>`;
      } else if (isFirst) {
        let totalNum = 0;
        if (recordCount === 1) {
          const fn = fNumericValues[idx];
          if (!isNaN(fn)) totalNum = fn;
        }
        totalCell = `<Cell${mdAttr} ss:StyleID="TotalStyle"><Data ss:Type="Number">${totalNum}</Data></Cell>`;
      } else {
        totalCell = `<Cell ss:StyleID="TotalStyle"></Cell>`;
      }

      const seqVal = isFirst ? (r.seq !== '' ? r.seq : '') : '';
      const seqType = typeof r.seq === 'number' && isFirst ? 'Number' : 'String';

      // 入党时间：YYYY-MM-DD → YYYY-MM-DD\n（横杠分隔+末尾换行，与原始xlsx完全一致）
      let joinDate = isFirst ? (r.joinDate || '') : '';
      if (joinDate) {
        const m = String(joinDate).match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
        if (m) {
          joinDate = m[3]
            ? `${m[0].slice(0,4)}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}\n`
            : `${m[0].slice(0,4)}-${String(m[2]).padStart(2,'0')}\n`;
        }
      }

      // 参加培训时间：YYYY-MM-DD → YYYY.MM.DD（点号分隔，与原始xlsx一致）
      let trainDate = r.trainDate || '';
      if (trainDate) {
        const m = String(trainDate).match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
        if (m) {
          trainDate = m[3]
            ? `${m[0].slice(0,4)}.${String(m[2]).padStart(2,'0')}.${String(m[3]).padStart(2,'0')}`
            : `${m[0].slice(0,4)}.${String(m[2]).padStart(2,'0')}`;
        }
      }

      // 合并列：仅首行有值+MergeDown，其余行输出空 Cell
      cells += `
      <Row ss:StyleID="DataRowStyle" ss:AutoFitHeight="0">
        <Cell${mdAttr} ss:StyleID="IndexStyle"><Data ss:Type="${seqType}">${xmlEscape(seqVal)}</Data></Cell>
        <Cell${mdAttr} ss:StyleID="NameStyle"><Data ss:Type="String">${xmlEscape(isFirst ? r.name : '')}</Data></Cell>
        <Cell${mdAttr} ss:StyleID="JoinDateStyle"><Data ss:Type="String">${xmlEscape(joinDate)}</Data></Cell>
        <Cell ss:StyleID="TrainDateStyle"><Data ss:Type="String">${xmlEscape(trainDate)}</Data></Cell>
        <Cell ss:StyleID="ContentStyle"><Data ss:Type="String">${xmlEscape(r.content || '')}</Data></Cell>
        ${durationCell}
        ${totalCell}
      </Row>`;
    });

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
  <WindowHeight>9000</WindowHeight>
  <WindowWidth>15000</WindowWidth>
  <ProtectStructure>False</ProtectStructure>
  <ProtectWindows>False</ProtectWindows>
 </ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="宋体" ss:Size="10"/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="22" ss:Bold="1"/>
  </Style>
  <Style ss:ID="SubTitleStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="12" ss:Bold="0"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRowStyle">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="IndexStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="NameStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="JoinDateStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="TrainDateStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="ContentStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="DurationStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11"/>
  </Style>
  <Style ss:ID="TotalStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="宋体" ss:Size="11" ss:Bold="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(branchName)}">
  <Table ss:ExpandedColumnCount="7" ss:ExpandedRowCount="${3 + rows.length}">
      ${colDefs}${cells}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
   </PageSetup>
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>3</SplitHorizontal>
   <TopRowBottomPane>3</TopRowBottomPane>
   <ActivePane>BottomRight</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
  }

  function exportData() {
    const data = Store.exportData();
    navigator.clipboard.writeText(data).then(() => {
      showToast('数据已复制到剪贴板，可粘贴保存', 'success');
    }).catch(() => {
      // 降级方案：弹窗显示
      const modal = document.createElement('div');
      modal.className = 'modal-mask';
      modal.innerHTML = `
        <div class="modal modal-lg">
          <div class="modal-title">导出数据</div>
          <div class="modal-tip">请全选并复制以下数据保存</div>
          <textarea class="form-textarea" style="height:300px;" readonly>${escapeHtml(data)}</textarea>
          <div class="form-actions">
            <button class="btn btn-primary" data-action="close">关闭</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'close' || e.target === modal) {
          modal.remove();
        }
      });
    });
  }

  function openImportModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal modal-lg">
        <div class="modal-title">导入数据</div>
        <div class="modal-tip">粘贴之前导出的 JSON 数据，导入将覆盖当前数据</div>
        <div class="form-item">
          <textarea class="form-textarea" id="importInput" placeholder="在此粘贴导出的 JSON 数据" style="height:300px;"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-default" data-action="cancel">取消</button>
          <button class="btn btn-primary" data-action="confirm">确认导入</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => $('#importInput').focus(), 50);

    modal.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'cancel' || e.target === modal) {
        modal.remove();
      } else if (action === 'confirm') {
        const text = $('#importInput').value.trim();
        if (!text) {
          showToast('请粘贴数据', 'error');
          return;
        }
        const result = Store.importData(text);
        if (result.success) {
          modal.remove();
          render();
          showToast('数据导入成功', 'success');
        } else {
          showToast(result.error, 'error');
        }
      }
    });
  }

  function clearAllData() {
    confirmDialog(
      '危险操作',
      '将清除所有党员和培训记录并重置为初始党支部，此操作不可撤销！',
      async () => {
        showToast('正在重置...');
        await Store.clearAll();
        render();
        showToast('数据已重置', 'success');
      },
      '确认重置',
      true
    );
  }

  // ============ 初始化 ============
  async function init() {
    // 绑定 Tab 切换
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    // 显示加载状态
    const main = $('#appMain');
    if (main) {
      main.innerHTML = `
        <div class="empty-state" style="padding:80px;">
          <div class="empty-icon" style="font-size:48px;animation:spin 1s linear infinite;">◐</div>
          <div class="empty-text">正在从服务器加载数据...</div>
        </div>
      `;
    }
    // 等待后端数据加载完成
    await Store.init();
    render();
  }

  return {
    init, switchView, render,
    onBranchChange, onSearch, selectBranch,
    openAddBranchModal, deleteBranch,
    openImportBranchExcelModal, onImportModeChange, onExcelFileSelected,
    openAddMemberModal, deleteMember,
    openAddTrainingModal, toggleMember, selectAllMembers, deleteRecord,
    exportBranchExcel, exportData, openImportModal, clearAllData
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
