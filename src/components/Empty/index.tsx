import React from 'react';
import { View, Text } from '@tarojs/components';
import styles from './index.module.scss';

interface EmptyProps {
  text?: string;
}

const Empty: React.FC<EmptyProps> = ({ text = '暂无数据' }) => {
  return (
    <View className={styles.empty}>
      <View className={styles.icon}>📭</View>
      <Text className={styles.text}>{text}</Text>
    </View>
  );
};

export default Empty;
