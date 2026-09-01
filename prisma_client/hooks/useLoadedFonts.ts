/**
 * Load app font families via expo-font; gate UI until fonts are ready.
 */
import { useFonts } from "expo-font";

/**
 * Custom hook to load the fonts for the application
 * @returns boolean
 */
export const useLoadedFonts = () => {
  const [fontsLoaded] = useFonts({
    BarlowRegular: require("@/assets/fonts/Barlow-Regular.ttf"),
    BarlowMedium: require("@/assets/fonts/Barlow-Medium.ttf"),
    RobotoMedium: require("@/assets/fonts/Roboto-Medium.ttf"),
  });
  return fontsLoaded;
};
