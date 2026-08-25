import React from 'react';
import { View, Text } from '@tarojs/components';
import type { TrainingRecord } from '@/types';
import styles from './index.module.scss';

interface TrainingRecordItemProps {
  record: TrainingRecord;
  index?: number;
  memberName?: string;
  onDelete?: () => void;
}

const TrainingRecordItem: React.FC<TrainingRecordItemProps> = ({
  record,
  index,
  memberName,
  onDelete
}) => {
  return (
    <View className={styles.record}>
      {typeof index === 'number' && (
        <View className={styles.indexBadge}>
          <Text className={styles.indexText}>{index + 1}</Text>
        </View>
      )}
      <View className={styles.content}>
        {memberName && (
          <View className={styles.memberRow}>
            <Text className={styles.memberName}>{memberName}</Text>
          </View>
        )}
        <View className={styles.dateRow}>
          <Text className={styles.dateLabel}>培训时间</Text>
          <Text className={styles.dateValue}>{record.trainingDate}</Text>
          <View className={styles.durationTag}>
            <Text className={styles.durationText}>{record.duration}</Text>
          </View>
        </View>
        <View className={styles.contentRow}>
          <Text className={styles.contentLabel}>方式及内容</Text>
          <Text className={styles.contentValue}>{record.methodAndContent}</Text>
        </View>
      </View>
      {onDelete && (
        <View
          className={styles.deleteBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Text className={styles.deleteIcon}>×</Text>
        </View>
      )}
    </View>
  );
};

export default TrainingRecordItem;
