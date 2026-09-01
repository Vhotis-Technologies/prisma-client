import { View } from 'react-native'
import React from 'react'
import { Redirect, Stack } from 'expo-router'
import { useThemeColor } from '@/hooks/useThemeColor'
import { useAppSelector, RootState } from '@/app/store/main_store'
import { canUsePersonalGarage } from '@/app/utils/account'

const GarageLayout = () => {
  const backgroundColor = useThemeColor({}, "background");
  const user = useAppSelector((state: RootState) => state.auth.user);
  if (user && !canUsePersonalGarage(user)) {
    return <Redirect href="/main/bookings/BookingScreen" />;
  }
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
