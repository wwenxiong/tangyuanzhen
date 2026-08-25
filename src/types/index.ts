// 党员
export interface PartyMember {
  id: string;
  name: string;
  branchId: string;
  createdAt: string;
}

// 培训记录
export interface TrainingRecord {
  id: string;
  memberId: string;
  branchId: string;
  trainingDate: string; // 参加培训时间 YYYY-MM-DD
  methodAndContent: string; // 培训方式及内容
  duration: string; // 培训时长
  createdAt: string;
}

// 党支部
export interface PartyBranch {
  id: string;
  name: string;
  createdAt: string;
}

// 党员带培训记录（用于展示）
export interface MemberWithRecords extends PartyMember {
  records: TrainingRecord[];
}

// 添加培训表单
export interface TrainingForm {
  memberIds: string[];
  trainingDate: string;
  methodAndContent: string;
  duration: string;
}
