import React from 'react';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import type { PartyMember } from '@/types';
import styles from './index.module.scss';

interface MemberItemProps {
  member: PartyMember;
  recordCount?: number;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

const MemberItem: React.FC<MemberItemProps> = ({
  member,
  recordCount = 0,
  selected,
  selectable,
  onClick,
  onDelete
}) => {
  return (
    <View
      className={classnames(styles.item, selected && styles.selected)}
      onClick={onClick}
    >
      {selectable && (
        <View className={classnames(styles.checkbox, selected && styles.checkboxChecked)}>
          {selected && <Text className={styles.checkmark}>✓</Text>}
        </View>
      )}
      <View className={styles.avatar}>
        <Text className={styles.avatarText}>{member.name.slice(0, 1)}</Text>
      </View>
      <View className={styles.info}>
        <Text className={styles.name}>{member.name}</Text>
        <Text className={styles.subText}>培训记录 {recordCount} 条</Text>
      </View>
      {!selectable && onDelete && (
        <View
          className={styles.deleteBtn}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Text className={styles.deleteText}>删除</Text>
        </View>
      )}
    </View>
  );
};

export default MemberItem;
