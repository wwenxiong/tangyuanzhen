import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import type { PartyBranch } from '@/types';
import styles from './index.module.scss';

interface BranchCardProps {
  branch: PartyBranch;
  memberCount: number;
  recordCount: number;
  isActive?: boolean;
  onClick?: () => void;
}

const BranchCard: React.FC<BranchCardProps> = ({
  branch,
  memberCount,
  recordCount,
  isActive,
  onClick
}) => {
  return (
    <View
      className={classnames(styles.card, isActive && styles.active)}
      onClick={onClick}
    >
      <View className={styles.header}>
        <View className={styles.badge}>
          <Text className={styles.badgeText}>支部</Text>
        </View>
        <Text className={styles.name}>{branch.name}</Text>
      </View>
      <View className={styles.stats}>
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{memberCount}</Text>
          <Text className={styles.statLabel}>党员</Text>
        </View>
        <View className={styles.statDivider} />
        <View className={styles.statItem}>
          <Text className={styles.statNum}>{recordCount}</Text>
          <Text className={styles.statLabel}>培训记录</Text>
        </View>
      </View>
      {isActive && (
        <View className={styles.activeTag}>
          <Text className={styles.activeTagText}>当前</Text>
        </View>
      )}
    </View>
  );
};

export default BranchCard;
