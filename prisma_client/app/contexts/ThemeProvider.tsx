/**
 * Theme context: light/dark/system, persisted to SecureStore. useThemeContext for current theme and setTheme.
 */
import { useLoadedFonts } from "@/hooks/useLoadedFonts";
import { createContext, useContext, useState, useEffect } from "react";
import { ActivityIndicator, Dimensions, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";

type ThemeMode = "light" | "dark" | "system";

const ThemeContext = createContext({
  theme: "system" as ThemeMode,
  setTheme: (theme: ThemeMode) => {},
  currentTheme: "light" as "light" | "dark",
});

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const fontsLoaded = useLoadedFonts();
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [isLoading, setIsLoading] = useState(true);
  const systemColorScheme = useColorScheme();

  // Load saved theme on app start
  useEffect(() => {
    const loadSavedTheme = async () => {
      try {
        const savedTheme = await SecureStore.getItemAsync("userTheme");
        if (
          savedTheme &&
          (savedTheme === "light" ||
            savedTheme === "dark" ||
            savedTheme === "system")
        ) {
          setTheme(savedTheme as ThemeMode);
        }
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    loadSavedTheme();
  }, []);

  // Save theme when it changes
  const saveTheme = async (newTheme: ThemeMode) => {
    try {
      await SecureStore.setItemAsync("userTheme", newTheme);
    } catch (error) {
    }
  };

  // Wrapper function to set theme and save it
  const setThemeAndSave = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    saveTheme(newTheme);
  };

  // Calculate the current theme based on the selected mode
  const currentTheme = (() => {
    if (theme === "system") {
      return systemColorScheme ?? "light";
    }
    // Ensure theme is either "light" or "dark"
    return theme === "dark" ? "dark" : "light";
  })();

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme: setThemeAndSave, currentTheme }}
    >
      {/* Load the fonts when the page mounts so that every page would have access to the font family */}
      {fontsLoaded && !isLoading ? (
        children
      ) : (
        <ActivityIndicator size="large" color={"#000"} />
      )}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
};

export default ThemeProvider;
