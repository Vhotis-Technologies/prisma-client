import { StatusBar, StyleSheet } from 'react-native'
import React from 'react'
import { Stack } from 'expo-router'
import { useThemeContext } from '../contexts/ThemeProvider'

const VehicleHistoryLayout = () => {
    const { currentTheme } = useThemeContext();

  // Set status bar style based on theme
  // Light theme -> dark content, Dark theme -> light content
  const statusBarStyle =
    currentTheme === "dark" ? "light-content" : "dark-content";
  return (
    <Stack screenOptions={{
      headerShown: false,
    }}>   
      <StatusBar barStyle={statusBarStyle} />
      <Stack.Screen name="VehicleDataInputScreen" />
      <Stack.Screen name="VehicleHistoryScreen" />
      <Stack.Screen name="VehicleLookupPaymentScreen" />
    </Stack>
  )
}

export default VehicleHistoryLayout

const styles = StyleSheet.create({})