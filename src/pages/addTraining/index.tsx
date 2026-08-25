import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Input, Textarea, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import MemberItem from '@/components/MemberItem';
import Empty from '@/components/Empty';
import { now } from '@/utils';
import styles from './index.module.scss';

const AddTrainingPage: React.FC = () => {
  const { branches, currentBranchId, getMembersByBranch, getRecordsByMember, addTrainingRecords } = useAppStore();

  const currentBranch = useMemo(
    () => branches.find((b) => b.id === currentBranchId),
    [branches, currentBranchId]
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [trainingDate, setTrainingDate] = useState(now());
  const [methodAndContent, setMethodAndContent] = useState('');
  const [duration, setDuration] = useState('');

  const branchMembers = useMemo(() => {
    if (!currentBranchId) return [];
    return getMembersByBranch(currentBranchId).map((m) => ({
      ...m,
      recordCount: getRecordsByMember(m.id).length
    }));
  }, [currentBranchId, getMembersByBranch, getRecordsByMember]);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === branchMembers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(branchMembers.map((m) => m.id));
    }
  };

  const handleSubmit = () => {
    if (selectedIds.length === 0) {
      Taro.showToast({ title: '请至少选择一名党员', icon: 'none' });
      return;
    }
    if (!trainingDate) {
      Taro.showToast({ title: '请选择培训时间', icon: 'none' });
      return;
    }
    if (!methodAndContent.trim()) {
      Taro.showToast({ title: '请填写培训方式及内容', icon: 'none' });
      return;
    }
    if (!duration.trim()) {
      Taro.showToast({ title: '请填写培训时长', icon: 'none' });
      return;
    }

    addTrainingRecords({
      memberIds: selectedIds,
      trainingDate,
      methodAndContent: methodAndContent.trim(),
      duration: duration.trim()
    });

    Taro.showToast({ title: `已为${selectedIds.length}人添加记录`, icon: 'success' });
    setTimeout(() => Taro.navigateBack(), 1500);
  };

  if (!currentBranch) {
    return (
      <View className={styles.container}>
        <Empty text="请先选择一个党支部" />
      </View>
    );
  }

  const allSelected = selectedIds.length > 0 && selectedIds.length === branchMembers.length;

  return (
    <View className={styles.container}>
      <ScrollView scrollY className={styles.scrollContent}>
        {/* 选择党员 */}
        <View className={styles.section}>
          <View className={styles.sectionHeader}>
            <Text className={styles.sectionTitle}>选择党员</Text>
            <View className={styles.selectAllBtn} onClick={selectAll}>
              <Text className={styles.selectAllText}>{allSelected ? '取消全选' : '全选'}</Text>
            </View>
          </View>
          <Text className={styles.selectedCount}>已选 {selectedIds.length} / {branchMembers.length} 人</Text>

          {branchMembers.length === 0 ? (
            <Empty text="暂无党员，请先到党员页添加" />
          ) : (
            branchMembers.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                recordCount={member.recordCount}
                selectable
                selected={selectedIds.includes(member.id)}
                onClick={() => toggleMember(member.id)}
              />
            ))
          )}
        </View>

        {/* 培训信息 */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>培训信息</Text>

          <View className={styles.formItem}>
            <Text className={styles.label}>参加培训时间</Text>
            <Input
              className={styles.input}
              type="text"
              placeholder="YYYY-MM-DD"
              value={trainingDate}
              onInput={(e) => setTrainingDate(e.detail.value)}
            />
          </View>

          <View className={styles.formItem}>
            <Text className={styles.label}>培训方式及内容</Text>
            <Textarea
              className={styles.textarea}
              placeholder="请输入培训方式及内容，如：集中学习《党章》"
              value={methodAndContent}
              onInput={(e) => setMethodAndContent(e.detail.value)}
              maxlength={200}
            />
          </View>

          <View className={styles.formItem}>
            <Text className={styles.label}>培训时长</Text>
            <Input
              className={styles.input}
              placeholder="如：2小时 / 半天 / 3天"
              value={duration}
              onInput={(e) => setDuration(e.detail.value)}
            />
          </View>
        </View>

        {/* 预览 */}
        {selectedIds.length > 0 && methodAndContent && (
          <View className={styles.preview}>
            <Text className={styles.previewTitle}>将添加以下记录：</Text>
            <Text className={styles.previewText}>
              为 {selectedIds.length} 名党员添加培训记录：{trainingDate} | {methodAndContent} | {duration}
            </Text>
          </View>
        )}
      </ScrollView>

      <View className={styles.footer}>
        <Button
          className={styles.submitBtn}
          onClick={handleSubmit}
        >
          确认添加（{selectedIds.length}人）
        </Button>
      </View>
    </View>
  );
};

export default AddTrainingPage;
