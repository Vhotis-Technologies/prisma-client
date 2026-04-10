import { View } from 'react-native'
import React from 'react'
import { Stack } from 'expo-router'
import { useThemeColor } from '@/hooks/useThemeColor'

const GarageLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor }}>
      <Stack screenOptions={{
      headerShown: false,
    }}>
      <Stack.Screen name="GarageScreen"/>
      <Stack.Screen name="VehicleDetailsScreen"/>
      <Stack.Screen name="VehicleDataUploadScreen"/>
    </Stack>
    </View>
  );
}

export default GarageLayout
