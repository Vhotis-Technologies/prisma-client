import { useFonts } from "expo-font";

/**
 * Custom hook to load the fonts for the application
 * @returns boolean
 */
export const useLoadedFonts = () => {
  const [fontsLoaded] = useFonts({
    SpaceMonoRegular: require("@/assets/fonts/SpaceMono-Regular.ttf"),
    SpaceMonoBold: require("@/assets/fonts/SpaceMono-Bold.ttf"),
    BarlowRegular: require("@/assets/fonts/Barlow-Regular.ttf"),
    BarlowLight: require("@/assets/fonts/Barlow-Light.ttf"),
    RobotoRegular: require("@/assets/fonts/Roboto-Regular.ttf"),
    RobotoLight: require("@/assets/fonts/Roboto-Light.ttf"),
    OswaldVariable: require("@/assets/fonts/Oswald-VariableFont_wght.ttf"),
    BarlowMedium: require("@/assets/fonts/Barlow-Medium.ttf"),
    RobotoMedium: require("@/assets/fonts/Roboto-Medium.ttf"),
  });
  return fontsLoaded;
};
