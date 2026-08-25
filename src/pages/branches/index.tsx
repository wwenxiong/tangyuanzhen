import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import BranchCard from '@/components/BranchCard';
import Empty from '@/components/Empty';
import styles from './index.module.scss';

const BranchesPage: React.FC = () => {
  const { branches, members, records, currentBranchId, addBranch, setCurrentBranch, deleteBranch } = useAppStore();
  const [searchKey, setSearchKey] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const filteredBranches = useMemo(() => {
    if (!searchKey.trim()) return branches;
    return branches.filter((b) => b.name.includes(searchKey.trim()));
  }, [branches, searchKey]);

  const getMemberCount = (branchId: string) => members.filter((m) => m.branchId === branchId).length;
  const getRecordCount = (branchId: string) => records.filter((r) => r.branchId === branchId).length;

  const handleBranchClick = (branchId: string) => {
    setCurrentBranch(branchId);
    Taro.switchTab({ url: '/pages/members/index' });
  };

  const handleAddBranch = () => {
    const name = newBranchName.trim();
    if (!name) {
      Taro.showToast({ title: '请输入党支部名称', icon: 'none' });
      return;
    }
    if (branches.some((b) => b.name === name)) {
      Taro.showToast({ title: '该党支部已存在', icon: 'none' });
      return;
    }
    addBranch(name);
    setNewBranchName('');
    setShowAddDialog(false);
    Taro.showToast({ title: '创建成功', icon: 'success' });
  };

  const handleDeleteBranch = (branch) => {
    Taro.showModal({
      title: '确认删除',
      content: `删除「${branch.name}」党支部将同时删除其所有党员和培训记录，确认删除？`,
      confirmColor: '#d43030',
      success: (res) => {
        if (res.confirm) {
          deleteBranch(branch.id);
          Taro.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  };

  return (
    <View className={styles.container}>
      <View className={styles.searchBar}>
        <Input
          className={styles.searchInput}
          placeholder="搜索党支部名称"
          value={searchKey}
          onInput={(e) => setSearchKey(e.detail.value)}
        />
      </View>

      <ScrollView scrollY className={styles.list}>
        {filteredBranches.length === 0 ? (
          <Empty text="暂无党支部，点击下方按钮新建" />
        ) : (
          filteredBranches.map((branch) => (
            <View key={branch.id} className={styles.cardWrapper}>
              <BranchCard
                branch={branch}
                memberCount={getMemberCount(branch.id)}
                recordCount={getRecordCount(branch.id)}
                isActive={branch.id === currentBranchId}
                onClick={() => handleBranchClick(branch.id)}
              />
              <View
                className={styles.deleteBtn}
                onClick={() => handleDeleteBranch(branch)}
              >
                <Text className={styles.deleteText}>删除</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View className={styles.footer}>
        <Button
          className={styles.addBtn}
          onClick={() => setShowAddDialog(true)}
        >
          + 新建党支部
        </Button>
      </View>

      {showAddDialog && (
        <View className={styles.mask} onClick={() => setShowAddDialog(false)}>
          <View className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.dialogTitle}>新建党支部</Text>
            <Input
              className={styles.dialogInput}
              placeholder="请输入党支部名称"
              value={newBranchName}
              focus
              onInput={(e) => setNewBranchName(e.detail.value)}
            />
            <View className={styles.dialogBtns}>
              <Button className={styles.dialogCancel} onClick={() => setShowAddDialog(false)}>取消</Button>
              <Button className={styles.dialogConfirm} onClick={handleAddBranch}>确认</Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default BranchesPage;
