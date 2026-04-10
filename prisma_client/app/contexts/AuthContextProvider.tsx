/**
 * Auth persistence: load tokens and user from SecureStore on mount, restore auth state, clear on logout.
 */
import React, { createContext, useContext } from "react";
import { InteractionManager } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useAlertContext } from "./AlertContext";
import { useAppDispatch, AppDispatch } from "../store/main_store";
import {
  logout,
  setIsAuthenticated,
  setUser,
  setAccessToken,
  setRefreshToken,
} from "../store/slices/authSlice";
import { useLoginMutation } from "../store/api/authApi";
import { UserProfileProps } from "../interfaces/ProfileInterfaces";
import { router } from "expo-router";

/* Save the user data to the secure store.
 * Also save the access and refresh tokens to the secure store.
 * This will be used to authenticate the user when the user is logged in.
 * The access token will be used to authenticate the user when the user is logged in.
 * The refresh token will be used to refresh the access token when the access token is expired.
 */
const saveUserToSecureStore = async (
  user: UserProfileProps,
  access: string,
  refresh: string,
) => {
  try {
    await SecureStore.setItemAsync("user", JSON.stringify(user));
    await SecureStore.setItemAsync("access", access);
    await SecureStore.setItemAsync("refresh", refresh);
    return true;
  } catch (error) {
    console.error("Error saving user to secure store:", error);
    return false;
  }
};

/**
 * Create an auth context to manage the user's authentication state.
 */
interface AuthContextType {
  handleLogin: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<void>;
  handleLogout: () => void;
  isLoading: boolean;
  isError: boolean;
  error: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthContextProvider = ({ children }: { children: React.ReactNode }) => {
  const dispatch: AppDispatch = useAppDispatch();
  const { setIsVisible, setAlertConfig } = useAlertContext();

  /* Destructure the login mutation from the authApi */
  const [login, { isLoading, isError, error, status }] = useLoginMutation();

  /**
   * Reauthenticate a user when the page mounts by checking the secure store for the user data
   * If the data is correct, set data to the redux store and navigate to the dashboard page.
   */
  React.useEffect(() => {
    const reauthenticateUser = async () => {
      const user = await SecureStore.getItemAsync("user");
      const storedAccess = await SecureStore.getItemAsync("access");
      const storedRefresh = await SecureStore.getItemAsync("refresh");
      // Check if the user is authenticated.
      if (user && storedAccess && storedRefresh) {
        dispatch(setUser(JSON.parse(user)));
        dispatch(setAccessToken(storedAccess));
        dispatch(setRefreshToken(storedRefresh));
        dispatch(setIsAuthenticated(true));
        router.replace("/main/dashboard/DashboardScreen" as any);
      }
    };
    reauthenticateUser();
  }, []);

  /* Handle the users logout functionality */
  const handleLogout = () => {
    setAlertConfig({
      title: "Logout",
      message: "Are you sure you want to logout?",
      type: "success",
      isVisible: true,
      onConfirm: async () => {
        try {
          await SecureStore.deleteItemAsync("user");
          await SecureStore.deleteItemAsync("access");
          await SecureStore.deleteItemAsync("refresh");
          // Defer state update and navigation until after current frame and interactions
          // to avoid Android crash: getChildDrawingOrder() returned invalid index (react-native-screens)
          InteractionManager.runAfterInteractions(() => {
            dispatch(logout());
            router.replace("/onboarding/SigninScreen");
          });
        } catch (error) {
          console.error("Error during logout:", error);
        }
      },
      onClose: () => {
        setIsVisible(false);
      },
    });
  };

  /**
   * Login a new user using their email and password.
   * @param {email:string, password:string} credentials - The credentials of the user to login.
   * These will be sent to the server side to validate the user and when the user is properly validated,
   * the user will be redirected to the dashboard page
   */
  const handleLogin = async (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => {
    const normalizedEmail = email.trim().toLowerCase();
    const credentials = { email: normalizedEmail, password };
    try {
      const response = await login(credentials).unwrap();

      // The response from the server should contain user, access, and refresh
      if (response && response.user && response.access && response.refresh) {
        dispatch(setUser(response.user));
        dispatch(setIsAuthenticated(true));
        dispatch(setAccessToken(response.access));
        dispatch(setRefreshToken(response.refresh));

        if (rememberMe) {
          // Call the save function to save the user data to the secure store.
          const saved = await saveUserToSecureStore(
            response.user,
            response.access,
            response.refresh,
          );
          if (saved) {
            router.replace("/main/dashboard/DashboardScreen" as any);
          }
        } else {
          router.replace("/main/dashboard/DashboardScreen" as any);
        }
      } else {
        console.error("Invalid response structure:", response);
      }
    } catch (error) {
      console.error("Error during login:", error);
    }
  };

  const value = {
    handleLogin,
    handleLogout,
    isLoading,
    isError,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useAuthContext must be used within an AuthContextProvider",
    );
  }
  return context;
};

export default AuthContextProvider;
