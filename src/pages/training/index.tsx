import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import TrainingRecordItem from '@/components/TrainingRecordItem';
import Empty from '@/components/Empty';
import styles from './index.module.scss';

const TrainingPage: React.FC = () => {
  const { branches, members, records, currentBranchId, getMembersByBranch, getRecordsByMember, deleteRecord } = useAppStore();
  const [viewMode, setViewMode] = useState<'byMember' | 'all'>('byMember');

  const currentBranch = useMemo(
    () => branches.find((b) => b.id === currentBranchId),
    [branches, currentBranchId]
  );

  // 按党员分组查看（每个党员的记录按时间升序）
  const membersWithRecords = useMemo(() => {
    if (!currentBranchId) return [];
    return getMembersByBranch(currentBranchId)
      .map((m) => ({
        ...m,
        records: getRecordsByMember(m.id)
      }))
      .filter((m) => m.records.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId, members, records]);

  // 全部记录查看（按时间倒序）
  const allRecords = useMemo(() => {
    if (!currentBranchId) return [];
    return records
      .filter((r) => r.branchId === currentBranchId)
      .sort((a, b) => b.trainingDate.localeCompare(a.trainingDate));
  }, [records, currentBranchId]);

  const memberMap = useMemo(() => {
    const map = new Map();
    if (currentBranchId) {
      getMembersByBranch(currentBranchId).forEach((m) => map.set(m.id, m));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranchId, members]);

  const handleAdd = () => {
    if (!currentBranch) {
      Taro.showToast({ title: '请先选择党支部', icon: 'none' });
      return;
    }
    const memberCount = getMembersByBranch(currentBranchId).length;
    if (memberCount === 0) {
      Taro.showToast({ title: '请先添加党员', icon: 'none' });
      setTimeout(() => Taro.switchTab({ url: '/pages/members/index' }), 1000);
      return;
    }
    Taro.navigateTo({ url: '/pages/addTraining/index' });
  };

  const handleDelete = (record) => {
    Taro.showModal({
      title: '确认删除',
      content: '确认删除这条培训记录？',
      confirmColor: '#d43030',
      success: (res) => {
        if (res.confirm) {
          deleteRecord(record.id);
          Taro.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  };

  if (!currentBranch) {
    return (
      <View className={styles.container}>
        <Empty text="请先选择一个党支部" />
        <View className={styles.gotoBtnWrap}>
          <Button
            className={styles.gotoBtn}
            onClick={() => Taro.switchTab({ url: '/pages/branches/index' })}
          >
            前往选择党支部
          </Button>
        </View>
      </View>
    );
  }

  const totalRecords = allRecords.length;

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View className={styles.branchInfo}>
          <Text className={styles.branchName}>{currentBranch.name}党支部</Text>
          <Text className={styles.branchSubText}>培训记录共 {totalRecords} 条</Text>
        </View>
        <View
          className={styles.switchBtn}
          onClick={() => Taro.switchTab({ url: '/pages/branches/index' })}
        >
          <Text className={styles.switchText}>切换</Text>
        </View>
      </View>

      {totalRecords > 0 && (
        <View className={styles.tabs}>
          <View
            className={viewMode === 'byMember' ? styles.tabActive : styles.tab}
            onClick={() => setViewMode('byMember')}
          >
            <Text>按党员</Text>
          </View>
          <View
            className={viewMode === 'all' ? styles.tabActive : styles.tab}
            onClick={() => setViewMode('all')}
          >
            <Text>全部记录</Text>
          </View>
        </View>
      )}

      <ScrollView scrollY className={styles.list}>
        {totalRecords === 0 ? (
          <Empty text="暂无培训记录，点击下方按钮添加" />
        ) : viewMode === 'byMember' ? (
          membersWithRecords.map((member) => (
            <View key={member.id} className={styles.memberGroup}>
              <View className={styles.memberHeader}>
                <View className={styles.memberAvatar}>
                  <Text className={styles.memberAvatarText}>{member.name.slice(0, 1)}</Text>
                </View>
 <Text className={styles.memberName}>{member.name}</Text>
                <Text className={styles.recordCount}>{member.records.length} 条记录</Text>
              </View>
              {member.records.map((record, index) => (
                <TrainingRecordItem
                  key={record.id}
                  record={record}
                  index={index}
                  onDelete={() => handleDelete(record)}
                />
              ))}
            </View>
          ))
        ) : (
          allRecords.map((record) => (
            <TrainingRecordItem
              key={record.id}
              record={record}
              memberName={memberMap.get(record.memberId)?.name || '未知'}
              onDelete={() => handleDelete(record)}
            />
          ))
        )}
      </ScrollView>

      <View className={styles.footer}>
        <Button
          className={styles.addBtn}
          onClick={handleAdd}
        >
          + 添加培训记录
        </Button>
      </View>
    </View>
  );
};

export default TrainingPage;
