import Taro from '@tarojs/taro';

export const STORAGE_KEY = 'party_training_data';

interface StorageData {
  branches: any[];
  members: any[];
  records: any[];
  currentBranchId: string | null;
}

// 读取本地存储
export function loadStorage(): StorageData | null {
  try {
    const data = Taro.getStorageSync(STORAGE_KEY);
    if (data) {
      return data as StorageData;
    }
    return null;
  } catch (error) {
    console.error('[Storage] 读取本地存储失败:', error);
    return null;
  }
}

// 保存到本地存储
export function saveStorage(data: StorageData): void {
  try {
    Taro.setStorageSync(STORAGE_KEY, data);
    console.log('[Storage] 数据保存成功');
  } catch (error) {
    console.error('[Storage] 保存本地存储失败:', error);
  }
}

// 清除本地存储
export function clearStorage(): void {
  try {
    Taro.removeStorageSync(STORAGE_KEY);
    console.log('[Storage] 数据已清除');
  } catch (error) {
    console.error('[Storage] 清除本地存储失败:', error);
  }
}
