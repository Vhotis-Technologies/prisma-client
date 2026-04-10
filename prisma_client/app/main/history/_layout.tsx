import { View } from 'react-native'
import React from 'react'
import { Stack } from 'expo-router'
import { useThemeColor } from '@/hooks/useThemeColor'

const HistoryLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor }}>
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HistoryScreen" />
      <Stack.Screen name="ServiceHistoryDetailScreen" />
    </Stack>
  </View>
  );
};

export default HistoryLayout;