import React from 'react'
import { StyleSheet, TouchableOpacity } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useThemeColor } from '@/hooks/useThemeColor'
import { useThemeContext } from '@/app/contexts/ThemeProvider'

type BackButtonProps = {
  size?: number
  style?: object
}

export const BackButton = ({ size = 20, style }: BackButtonProps) => {
  const textColor = useThemeColor({}, 'text')
  const { currentTheme } = useThemeContext()

  if (!router.canGoBack()) return null

  return (
    <BlurView
      intensity={10}
      tint={currentTheme === 'dark' ? 'dark' : 'light'}
      style={[styles.blurWrapper, style]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityLabel="Back"
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={size} color={textColor} />
      </TouchableOpacity>
    </BlurView>
  )
}

const styles = StyleSheet.create({
  blurWrapper: {
    alignSelf: 'flex-start',
    borderRadius: 25,
    overflow: 'hidden',
    marginStart: 10,
  },
  backButton: {
    padding: 5,
  },
})
