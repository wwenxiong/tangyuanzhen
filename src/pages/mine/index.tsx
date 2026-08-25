import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Textarea, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import styles from './index.module.scss';

const MinePage: React.FC = () => {
  const { branches, members, records, exportData, importData, clearAllData } = useAppStore();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');

  const stats = useMemo(() => ({
    branchCount: branches.length,
    memberCount: members.length,
    recordCount: records.length
  }), [branches, members, records]);

  const handleExport = () => {
    exportData();
  };

  const handleImport = () => {
    if (!importText.trim()) {
      Taro.showToast({ title: '请粘贴导入数据', icon: 'none' });
      return;
    }
    const success = importData(importText.trim());
    if (success) {
      setShowImportDialog(false);
      setImportText('');
      Taro.showToast({ title: '导入成功', icon: 'success' });
    } else {
      Taro.showToast({ title: '数据格式错误', icon: 'none' });
    }
  };

  const handleClear = () => {
    Taro.showModal({
      title: '危险操作',
      content: '将清除所有党员和培训记录并重置为初始党支部，确认操作？',
      confirmText: '确认重置',
      confirmColor: '#d43030',
      success: (res) => {
        if (res.confirm) {
          clearAllData();
          Taro.showToast({ title: '已重置', icon: 'success' });
        }
      }
    });
  };

  return (
    <View className={styles.container}>
      <ScrollView scrollY className={styles.scrollContent}>
        {/* 统计卡片 */}
        <View className={styles.statsCard}>
          <View className={styles.statsHeader}>
            <Text className={styles.statsTitle}>数据统计</Text>
          </View>
          <View className={styles.statsRow}>
            <View className={styles.statItem}>
              <Text className={styles.statNum}>{stats.branchCount}</Text>
              <Text className={styles.statLabel}>党支部</Text>
            </View>
            <View className={styles.statDivider} />
            <View className={styles.statItem}>
              <Text className={styles.statNum}>{stats.memberCount}</Text>
              <Text className={styles.statLabel}>党员</Text>
            </View>
            <View className={styles.statDivider} />
            <View className={styles.statItem}>
              <Text className={styles.statNum}>{stats.recordCount}</Text>
              <Text className={styles.statLabel}>培训记录</Text>
            </View>
          </View>
        </View>

        {/* 数据管理 */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>数据管理</Text>
          <Text className={styles.sectionDesc}>
            数据自动保存在本地，可导出备份或导入恢复。数据不会上传到服务器。
          </Text>

          <View className={styles.actionItem} onClick={handleExport}>
            <View className={styles.actionInfo}>
              <Text className={styles.actionTitle}>导出数据</Text>
              <Text className={styles.actionDesc}>将所有数据复制到剪贴板</Text>
            </View>
            <Text className={styles.arrow}>›</Text>
          </View>

          <View className={styles.actionItem} onClick={() => setShowImportDialog(true)}>
            <View className={styles.actionInfo}>
              <Text className={styles.actionTitle}>导入数据</Text>
              <Text className={styles.actionDesc}>从剪贴板粘贴数据恢复</Text>
            </View>
            <Text className={styles.arrow}>›</Text>
          </View>

          <View className={styles.actionItemDanger} onClick={handleClear}>
            <View className={styles.actionInfo}>
              <Text className={styles.actionTitleDanger}>重置数据</Text>
              <Text className={styles.actionDesc}>清除所有记录并重置为初始状态</Text>
            </View>
            <Text className={styles.arrow}>›</Text>
          </View>
        </View>

        {/* 关于 */}
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>关于</Text>
          <View className={styles.aboutCard}>
            <Text className={styles.aboutTitle}>党员培训记录管理系统</Text>
            <Text className={styles.aboutVersion}>版本 1.0.0</Text>
            <Text className={styles.aboutDesc}>
              汤原镇党员培训记录管理小程序，支持多党支部管理、党员信息维护、培训记录录入与查看。每个党支部独立管理，培训记录按时间自动排序。
            </Text>
          </View>
        </View>
      </ScrollView>

      {showImportDialog && (
        <View className={styles.mask} onClick={() => setShowImportDialog(false)}>
          <View className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <Text className={styles.dialogTitle}>导入数据</Text>
            <Text className={styles.dialogTip}>粘贴之前导出的数据</Text>
            <Textarea
              className={styles.dialogTextarea}
              placeholder="在此粘贴导出的JSON数据"
              value={importText}
              onInput={(e) => setImportText(e.detail.value)}
            />
            <View className={styles.dialogBtns}>
              <Button className={styles.dialogCancel} onClick={() => setShowImportDialog(false)}>取消</Button>
              <Button className={styles.dialogConfirm} onClick={handleImport}>导入</Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

export default MinePage;
