/**
 * Save/load auth data (user, access, refresh) to SecureStore. Used after login and for rehydration.
 */
import { UserProfileProps } from "@/app/interfaces/ProfileInterfaces";
import * as SecureStore from "expo-secure-store";

/**
 * Save the user data to the async storage after login.
 * This is used when the user tries to relogin,
 * @param user The returned user data which is of interface {User | Seller}
 * @param access The access token returned from the server
 * @param refresh The refresh token returned from the server
 */
export const saveDataToStorage = async (
  user: UserProfileProps | null,
  access: string,
  refresh: string
) => {
  try {
    await SecureStore.setItemAsync("user", JSON.stringify(user));
    await SecureStore.setItemAsync("access", access);
    await SecureStore.setItemAsync("refresh", refresh);
  } catch (error) {
  }
};

/**
 * Retrieve user data from storage
 * @returns Promise<UserProfileProps | null> - Returns user data if found, null otherwise
 */
export const getUserFromStorage =
  async (): Promise<UserProfileProps | null> => {
    try {
      const userData = await SecureStore.getItemAsync("user");
      if (userData) {
        return JSON.parse(userData);
      }
      return null;
    } catch (error) {
      return null;
    }
  };

/**
 * Update user data in storage
 * @param user - The updated user data to save
 */
export const updateUserInStorage = async (user: UserProfileProps) => {
  try {
    await SecureStore.setItemAsync("user", JSON.stringify(user));
  } catch (error) {
  }
};
