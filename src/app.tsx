import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
import { useAppStore } from '@/store/useAppStore';
import './app.scss';

function App(props) {
  const hydrate = useAppStore((s) => s.hydrate);

  useEffect(() => {
    // 初始化：从本地存储恢复数据
    hydrate();
  }, []);

  useDidShow(() => {});

  useDidHide(() => {});

  return props.children;
}

export default App;
