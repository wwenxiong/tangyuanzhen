import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Input, Button, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import MemberItem from '@/components/MemberItem';
import Empty from '@/components/Empty';
import styles from './index.module.scss';

const MembersPage: React.FC = () => {
  const {
    branches, members, records, currentBranchId,
    addMembers, deleteMember, setCurrentBranch
  } = useAppStore();

  const [searchKey, setSearchKey] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [inputText, setInputText] = useState('');

  const currentBranch = useMemo(
    () => branches.find((b) => b.id === currentBranchId),
    [branches, currentBranchId]
  );

  const branchMembers = useMemo(() => {
    const list = members.filter((m) => m.branchId === currentBranchId);
    if (!searchKey.trim()) return list;
    return list.filter((m) => m.name.includes(searchKey.trim()));
  }, [members, currentBranchId, searchKey]);

  const getRecordCount = (memberId: string) => records.filter((r) => r.memberId === memberId).length;

  const handleAddMembers = () => {
    const names = inputText.split(/[,，\n、\s]+/).filter((n) => n.trim());
    if (names.length === 0) {
      Taro.showToast({ title: '请输入党员姓名', icon: 'none' });
      return;
    }
    addMembers(names, currentBranchId);
    setInputText('');
    setShowAddDialog(false);
    Taro.showToast({ title: `已添加${names.length}人`, icon: 'success' });
  };

  const handleDeleteMember = (member) => {
    Taro.showModal({
      title: '确认删除',
      content: `删除党员「${member.name}」将同时删除其培训记录，确认删除？`,
      confirmColor: '#d43030',
      success: (res) => {
        if (res.confirm) {
          deleteMember(member.id);
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

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View className={styles.branchInfo}>
          <View className={styles.branchBadge}>
            <Text className={styles.branchBadgeText}>{currentBranch.name.slice(0, 1)}</Text>
          </View>
          <View className={styles.branchText}>
            <Text className={styles.branchName}>{currentBranch.name}党支部</Text>
            <Text className={styles.branchSubText}>共 {branchMembers.length} 名党员</Text>
          </View>
        </View>
        <View
          className={styles.switchBtn}
          onClick={() => Taro.switchTab({ url: '/pages/branches/index' })}
        >
          <Text className={styles.switchText}>切换</Text>
        </View>
      </View>

      <View className={styles.searchBar}>
        <Input
          className={styles.searchInput}
          placeholder="搜索党员姓名"
          value={searchKey}
          onInput={(e) => setSearchKey(e.detail.value)}
        />
      </View>

      <ScrollView scrollY className={styles.list}>
        {branchMembers.length === 0 ? (
          <Empty text="暂无党员，点击下方按钮添加" />
        ) : (
          branchMembers.map((member) => (
            <MemberItem
              key={member.id}
              member={member}
              recordCount={getRecordCount(member.id)}
              onDelete={() => handleDeleteMember(member)}
            />
          ))
        )}
      </ScrollView>

      <View className={styles.footer}>
        <Button
          className={styles.addBtn}
          onClick={() => setShowAddDialog(true)}
        >
          + 添加党员
        </Button>
      </View>

      {showAddDialog && (
        <View className={styles.mask} onClick={() => setShowAddDialog(false)}>
          <View className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.dialogTitle}>添加党员</Text>
            <Text className={styles.dialogTip}>多个姓名可用逗号、顿号或换行分隔</Text>
            <Textarea
              className={styles.dialogTextarea}
              placeholder="如：张三，李四，王五"
              value={inputText}
              focus
              onInput={(e) => setInputText(e.detail.value)}
            />
            <View className={styles.dialogBtns}>
              <Button className={styles.dialogCancel} onClick={() => setShowAddDialog(false)}>取消</Button>
              <Button className={styles.dialogConfirm} onClick={handleAddMembers}>确认添加</Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default MembersPage;
