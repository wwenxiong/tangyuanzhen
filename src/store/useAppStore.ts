import { create } from 'zustand';
import Taro from '@tarojs/taro';
import type { PartyBranch, PartyMember, TrainingRecord, TrainingForm } from '@/types';
import { INITIAL_BRANCHES } from '@/data/branches';
import { genId, timestamp, compareDate } from '@/utils';
import { loadStorage, saveStorage, clearStorage } from '@/services/storage';

const STORAGE_VERSION = 'v1';

interface AppState {
  branches: PartyBranch[];
  members: PartyMember[];
  records: TrainingRecord[];
  currentBranchId: string | null;
  hydrated: boolean;

  // 初始化：从本地存储恢复数据
  hydrate: () => void;
  // 持久化到本地存储
  persist: () => void;

  // 党支部相关
  addBranch: (name: string) => string;
  deleteBranch: (id: string) => void;
  renameBranch: (id: string, name: string) => void;
  setCurrentBranch: (id: string) => void;
  getCurrentBranch: () => PartyBranch | null;

  // 党员相关
  addMember: (name: string, branchId: string) => string;
  addMembers: (names: string[], branchId: string) => void;
  deleteMember: (id: string) => void;
  getMembersByBranch: (branchId: string) => PartyMember[];

  // 培训记录相关
  addTrainingRecords: (form: TrainingForm) => void;
  deleteRecord: (id: string) => void;
  getRecordsByBranch: (branchId: string) => TrainingRecord[];
  getRecordsByMember: (memberId: string) => TrainingRecord[];
  getMembersWithRecords: (branchId: string) => Array<PartyMember & { records: TrainingRecord[] }>;

  // 数据管理
  exportData: () => void;
  importData: (data: string) => boolean;
  clearAllData: () => void;
}

// 初始化默认党支部
function initBranches(): PartyBranch[] {
  return INITIAL_BRANCHES.map((name) => ({
    id: genId(),
    name,
    createdAt: timestamp()
  }));
}

export const useAppStore = create<AppState>((set, get) => ({
  branches: [],
  members: [],
  records: [],
  currentBranchId: null,
  hydrated: false,

  hydrate: () => {
    const saved = loadStorage();
    if (saved && saved.branches && saved.branches.length > 0) {
      set({
        branches: saved.branches,
        members: saved.members || [],
        records: saved.records || [],
        currentBranchId: saved.currentBranchId || saved.branches[0]?.id || null,
        hydrated: true
      });
      console.log('[Store] 从本地存储恢复数据成功, 党支部数:', saved.branches.length);
    } else {
      // 首次使用，初始化默认数据
      const branches = initBranches();
      set({
        branches,
        currentBranchId: branches[0]?.id || null,
        hydrated: true
      });
      console.log('[Store] 首次初始化, 创建默认党支部:', branches.length);
      get().persist();
    }
  },

  persist: () => {
    const { branches, members, records, currentBranchId } = get();
    saveStorage({ branches, members, records, currentBranchId });
  },

  // ========== 党支部 ==========
  addBranch: (name) => {
    const id = genId();
    const branch: PartyBranch = {
      id,
      name: name.trim(),
      createdAt: timestamp()
    };
    set((state) => ({ branches: [...state.branches, branch] }));
    get().persist();
    console.log('[Store] 新建党支部:', name, id);
    return id;
  },

  deleteBranch: (id) => {
    set((state) => ({
      branches: state.branches.filter((b) => b.id !== id),
      members: state.members.filter((m) => m.branchId !== id),
      records: state.records.filter((r) => r.branchId !== id),
      currentBranchId: state.currentBranchId === id
        ? state.branches.find((b) => b.id !== id)?.id || null
        : state.currentBranchId
    }));
    get().persist();
    console.log('[Store] 删除党支部:', id);
  },

  renameBranch: (id, name) => {
    set((state) => ({
      branches: state.branches.map((b) => (b.id === id ? { ...b, name: name.trim() } : b))
    }));
    get().persist();
  },

  setCurrentBranch: (id) => {
    set({ currentBranchId: id });
    get().persist();
  },

  getCurrentBranch: () => {
    const { branches, currentBranchId } = get();
    return branches.find((b) => b.id === currentBranchId) || null;
  },

  // ========== 党员 ==========
  addMember: (name, branchId) => {
    const id = genId();
    const member: PartyMember = {
      id,
      name: name.trim(),
      branchId,
      createdAt: timestamp()
    };
    set((state) => ({ members: [...state.members, member] }));
    get().persist();
    console.log('[Store] 新建党员:', name, id);
    return id;
  },

  addMembers: (names, branchId) => {
    const newMembers: PartyMember[] = names
      .filter((n) => n.trim())
      .map((name) => ({
        id: genId(),
        name: name.trim(),
        branchId,
        createdAt: timestamp()
      }));
    set((state) => ({ members: [...state.members, ...newMembers] }));
    get().persist();
    console.log('[Store] 批量新建党员:', newMembers.length, '人');
  },

  deleteMember: (id) => {
    set((state) => ({
      members: state.members.filter((m) => m.id !== id),
      records: state.records.filter((r) => r.memberId !== id)
    }));
    get().persist();
    console.log('[Store] 删除党员:', id);
  },

  getMembersByBranch: (branchId) => {
    return get().members
      .filter((m) => m.branchId === branchId)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  },

  // ========== 培训记录 ==========
  addTrainingRecords: (form) => {
    const createdAt = timestamp();
    const newRecords: TrainingRecord[] = form.memberIds.map((memberId) => {
      const member = get().members.find((m) => m.id === memberId);
      return {
        id: genId(),
        memberId,
        branchId: member?.branchId || '',
        trainingDate: form.trainingDate,
        methodAndContent: form.methodAndContent.trim(),
        duration: form.duration.trim(),
        createdAt
      };
    });
    set((state) => ({ records: [...state.records, ...newRecords] }));
    get().persist();
    console.log('[Store] 新增培训记录:', newRecords.length, '条, 涉及', form.memberIds.length, '人');
  },

  deleteRecord: (id) => {
    set((state) => ({ records: state.records.filter((r) => r.id !== id) }));
    get().persist();
    console.log('[Store] 删除培训记录:', id);
  },

  getRecordsByBranch: (branchId) => {
    return get().records
      .filter((r) => r.branchId === branchId)
      .sort((a, b) => compareDate(b.trainingDate, a.trainingDate)); // 按时间倒序
  },

  getRecordsByMember: (memberId) => {
    return get().records
      .filter((r) => r.memberId === memberId)
      .sort((a, b) => compareDate(a.trainingDate, b.trainingDate)); // 按时间升序
  },

  getMembersWithRecords: (branchId) => {
    const members = get().getMembersByBranch(branchId);
    return members.map((m) => ({
      ...m,
      records: get().getRecordsByMember(m.id)
    }));
  },

  // ========== 数据管理 ==========
  exportData: () => {
    const { branches, members, records, currentBranchId } = get();
    const dataStr = JSON.stringify({ branches, members, records, currentBranchId, version: STORAGE_VERSION }, null, 2);
    try {
      Taro.setClipboardData({
        data: dataStr,
        success: () => {
          console.log('[Store] 数据已导出到剪贴板');
          Taro.showToast({ title: '数据已复制到剪贴板', icon: 'success' });
        }
      });
    } catch (error) {
      console.error('[Store] 导出数据失败:', error);
    }
  },

  importData: (data) => {
    try {
      const dataObj = JSON.parse(data);
      if (!dataObj.branches || !Array.isArray(dataObj.branches)) {
        return false;
      }
      set({
        branches: dataObj.branches,
        members: dataObj.members || [],
        records: dataObj.records || [],
        currentBranchId: dataObj.currentBranchId || dataObj.branches[0]?.id || null
      });
      get().persist();
      console.log('[Store] 数据导入成功');
      return true;
    } catch (error) {
      console.error('[Store] 导入数据失败:', error);
      return false;
    }
  },

  clearAllData: () => {
    clearStorage();
    const branches = initBranches();
    set({
      branches,
      members: [],
      records: [],
      currentBranchId: branches[0]?.id || null
    });
    get().persist();
    console.log('[Store] 所有数据已重置');
  }
}));


