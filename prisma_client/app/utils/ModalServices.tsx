import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Animated,
  Dimensions,
} from "react-native";
import React, { useEffect, useRef } from "react";
import StyledText from "../components/helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";

const { height: screenHeight } = Dimensions.get("window");

interface ModalServicesProps {
  visible: boolean;
  onClose: () => void;
  component: React.ReactNode;
  title?: string;
  showCloseButton?: boolean;
  modalType?: "fullscreen" | "sheet" | "center";
  animationType?: "slide" | "fade" | "none";
  backgroundColor?: string;
  borderRadius?: number;
  maxHeight?: number;
}

const ModalServices = ({
  visible,
  onClose,
  component,
  title,
  showCloseButton = true,
  modalType = "center",
  animationType = "fade",
  backgroundColor,
  borderRadius = 16,
  maxHeight = screenHeight * 0.8,
}: ModalServicesProps) => {
  const themeBackground = useThemeColor({}, "background");
  const themeText = useThemeColor({}, "text");
  const themeBorder = useThemeColor({}, "borders");
  const themeCard = useThemeColor({}, "cards");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const cardBgColor = modalType === "fullscreen" ? themeBackground : themeCard;

  useEffect(() => {
    if (visible) {
      // Reset animations
      fadeAnim.setValue(0);
      slideAnim.setValue(screenHeight);
      scaleAnim.setValue(0.8);

      // Start animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        modalType === "sheet"
          ? Animated.timing(slideAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            })
          : Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
      ]).start();
    } else {
      // Hide animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        modalType === "sheet"
          ? Animated.timing(slideAnim, {
              toValue: screenHeight,
              duration: 200,
              useNativeDriver: true,
            })
          : Animated.timing(scaleAnim, {
              toValue: 0.8,
              duration: 200,
              useNativeDriver: true,
            }),
      ]).start();
    }
  }, [visible, modalType]);

  const renderModalContent = () => {
    switch (modalType) {
      case "fullscreen":
        return (
          <View
            style={[
              styles.fullscreenContainer,
              { backgroundColor: themeBackground },
            ]}
          >
            {title && (
              <View
                style={[
                  styles.fullscreenHeader,
                  { borderBottomColor: themeBorder },
                ]}
              >
                <StyledText
                  variant="titleMedium"
                  style={[styles.fullscreenTitle, { color: themeText }]}
                >
                  {title}
                </StyledText>
                {showCloseButton && (
                  <Pressable
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <StyledText
                      variant="titleMedium"
                      style={{ color: themeText }}
                    >
                      ✕
                    </StyledText>
                  </Pressable>
                )}
              </View>
            )}
            <ScrollView
              style={styles.fullscreenContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.fullscreenScrollContent}
              bounces={true}
              alwaysBounceVertical={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {component}
            </ScrollView>
          </View>
        );

      case "sheet":
        return (
          <Animated.View
            style={[
              styles.sheetContainer,
              {
                backgroundColor: cardBgColor,
                transform: [{ translateY: slideAnim }],
                borderTopLeftRadius: borderRadius,
                borderTopRightRadius: borderRadius,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { borderColor: themeBorder }]} />
            {title && (
              <View
                style={[styles.sheetHeader, { borderBottomColor: themeBorder }]}
              >
                <StyledText
                  variant="titleMedium"
                  style={[styles.sheetTitle, { color: themeText }]}
                >
                  {title}
                </StyledText>
                {showCloseButton && (
                  <Pressable
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <StyledText
                      variant="titleMedium"
                      style={{ color: themeText }}
                    >
                      ✕
                    </StyledText>
                  </Pressable>
                )}
              </View>
            )}
            <ScrollView
              style={styles.sheetContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetContentContainer}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {component}
            </ScrollView>
          </Animated.View>
        );

      default: // center
        return (
          <Animated.View
            style={[
              styles.centerContainer,
              {
                backgroundColor: cardBgColor,
                borderRadius: borderRadius,
                transform: [{ scale: scaleAnim }],
                maxHeight: maxHeight,
              },
            ]}
          >
            {title && (
              <View style={styles.centerHeader}>
                <StyledText
                  variant="titleMedium"
                  style={[styles.centerTitle, { color: themeText }]}
                >
                  {title}
                </StyledText>
                {showCloseButton && (
                  <Pressable
                    style={styles.closeButton}
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <StyledText
                      variant="titleMedium"
                      style={{ color: themeText }}
                    >
                      ✕
                    </StyledText>
                  </Pressable>
                )}
              </View>
            )}
            <ScrollView
              style={styles.centerContent}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.centerContentContainer}
              bounces={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {component}
            </ScrollView>
          </Animated.View>
        );
    }
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent={modalType !== "fullscreen"}
      animationType={animationType}
    >
      <Animated.View
        style={[
          styles.overlay,
          {
            backgroundColor:
              modalType === "fullscreen" ? "transparent" : "rgba(0, 0, 0, 0.5)",
            opacity: fadeAnim,
            justifyContent: modalType === "sheet" ? "flex-end" : "center",
          },
        ]}
      >
        <Pressable
          style={[
            styles.overlayPressable,
            { justifyContent: modalType === "sheet" ? "flex-end" : "center" },
          ]}
          onPress={modalType !== "fullscreen" ? onClose : undefined}
        >
          {renderModalContent()}
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

export default ModalServices;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlayPressable: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  // Fullscreen styles
  fullscreenContainer: {
    flex: 1,
    width: "100%",
    marginTop: 0,
  },
  fullscreenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  fullscreenTitle: {
    fontWeight: "600",
  },
  fullscreenContent: {
    flex: 1,
    flexGrow: 1,
  },
  fullscreenScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },

  // Sheet styles
  sheetContainer: {
    width: "100%",
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  sheetContent: {
    maxHeight: "85%",
  },
  sheetContentContainer: {
    padding: 10,
  },

  // Center styles
  centerContainer: {
    width: "90%",
    maxWidth: 400,
  },
  centerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  centerTitle: {
    fontWeight: "600",
  },
  centerContent: {
    maxHeight: "80%",
  },
  centerContentContainer: {
    padding: 20,
  },

  // Common styles
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
});
