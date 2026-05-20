/**
 * Profile hook: addresses CRUD, profile fetch/update, push/email/marketing tokens, service history.
 */
import React, { useCallback, useState, useEffect } from "react";
import {
  MyAddressProps,
  MyServiceHistoryProps,
  UserProfileProps,
} from "../interfaces/ProfileInterfaces";
import {
  useFetchAllUserAddressesQuery,
  useAddNewAddressMutation,
  useUpdateExistingAddressMutation,
  useDeleteExistingAddressMutation,
  useUpdatePushNotificationTokenMutation,
  useUpdateEmailNotificationTokenMutation,
  useUpdateMarketingEmailTokenMutation,
  useGetUserProfileQuery,
  useUpdateProfileMutation,
} from "../store/api/profileApi";
import {
  setNewAddress,
  clearNewAddress,
} from "@/app/store/slices/profileSlice";
import { updateUser, setUser } from "@/app/store/slices/authSlice";
import { RootState, useAppDispatch, useAppSelector } from "../store/main_store";
import { useAlertContext } from "../contexts/AlertContext";
import { useSnackbar } from "../contexts/SnackbarContext";
import {
  getUserFromStorage,
  updateUserInStorage,
} from "@/app/utils/helpers/storage";
import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
const image = require("@/assets/images/user_image.jpg");

/**
 * Profile hook: addresses CRUD, notification preferences, profile fetch/update.
 *
 * @returns Profile data, address handlers, loading/error states, and refetch helpers
 */
const useProfile = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state: RootState) => state.auth.user);
  const [userFromStorage, setUserFromStorage] =
    useState<UserProfileProps | null>(null);

  /* import and use the alert context to display an alert to the user when a neccessary action is performed */
  const { setIsVisible, setAlertConfig } = useAlertContext();

  /* import and use the snackbar context to display success messages */
  const { showSnackbarWithConfig } = useSnackbar();

  /* Get the new address state from the store */
  const newAddress = useAppSelector(
    (state: RootState) => state.profile.new_address
  );

  /* These are the destructured mutations for the profile screen
   * This is for the add new address, edit address, delete address.
   */
  const [
    addNewAddress,
    { isLoading: isLoadingAddAddress, error: errorAddAddress },
  ] = useAddNewAddressMutation();
  const [
    deleteExistingAddress,
    { isLoading: isLoadingDeleteAddress, error: errorDeleteAddress },
  ] = useDeleteExistingAddressMutation();
  const [
    updateExistingAddress,
    { isLoading: isLoadingUpdateAddress, error: errorUpdateAddress },
  ] = useUpdateExistingAddressMutation();
  const [
    updatePushNotificationToken,
    {
      isLoading: isLoadingUpdatePushNotificationToken,
      error: errorUpdatePushNotificationToken,
    },
  ] = useUpdatePushNotificationTokenMutation();
  const [
    updateEmailNotificationToken,
    {
      isLoading: isLoadingUpdateEmailNotificationToken,
      error: errorUpdateEmailNotificationToken,
    },
  ] = useUpdateEmailNotificationTokenMutation();
  const [
    updateMarketingEmailToken,
    {
      isLoading: isLoadingUpdateMarketingEmailToken,
      error: errorUpdateMarketingEmailToken,
    },
  ] = useUpdateMarketingEmailTokenMutation();
  const {
    data: profile,
    isLoading: isLoadingUserProfile,
    error: errorUserProfile,
    refetch: refetchUserProfile,
  } = useGetUserProfileQuery();
  const [updateProfileMutation, { isLoading: isUpdatingProfile }] =
    useUpdateProfileMutation();
  /**
   * Update push notification setting on the server
   * @param value - The new boolean value for push notifications
   * @returns Promise<boolean> - Returns true if successful, false otherwise
   */
  const updatePushNotificationSetting = async (
    value: boolean
  ): Promise<boolean> => {
    try {
      const response = await updatePushNotificationToken({
        update: value,
      }).unwrap();
      if (response.success) {
        // Update the user state with the new value
        dispatch(updateUser({ field: "push_notification_token", value }));
        // Update storage with the new user data
        if (currentUser) {
          const updatedUser = {
            ...userProfile,
            push_notification_token: value,
          };
          await updateUserInStorage(updatedUser);
        }
        return true;
      }
      return false;
    } catch (error: any) {
      setAlertConfig({
        title: "Error",
        message: "Failed to update push notification setting",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return false;
    }
  };

  /**
   * Update email notification setting on the server
   * @param value - The new boolean value for email notifications
   * @returns Promise<boolean> - Returns true if successful, false otherwise
   */
  const updateEmailNotificationSetting = async (
    value: boolean
  ): Promise<boolean> => {
    try {
      const response = await updateEmailNotificationToken({
        update: value,
      }).unwrap();
      if (response.success) {
        // Update the user state with the new value
        dispatch(updateUser({ field: "email_notification_token", value }));
        // Update storage with the new user data
        if (currentUser) {
          const updatedUser = {
            ...userProfile,
            email_notification_token: value,
          };
          await updateUserInStorage(updatedUser);
        }
        return true;
      }
      return false;
    } catch (error: any) {
      setAlertConfig({
        title: "Error",
        message: "Failed to update email notification setting",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return false;
    }
  };

  /**
   * Update marketing email setting on the server
   * @param value - The new boolean value for marketing emails
   * @returns Promise<boolean> - Returns true if successful, false otherwise
   */
  const updateMarketingEmailSetting = async (
    value: boolean
  ): Promise<boolean> => {
    try {
      const response = await updateMarketingEmailToken({
        update: value,
      }).unwrap();
      if (response.success) {
        // Update the user state with the new value
        dispatch(updateUser({ field: "marketing_email_token", value }));
        // Update storage with the new user data
        if (currentUser) {
          const updatedUser = { ...userProfile, marketing_email_token: value };
          await updateUserInStorage(updatedUser);
        }
        return true;
      }
      return false;
    } catch (error: any) {
      setAlertConfig({
        title: "Error",
        message: "Failed to update marketing email setting",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return false;
    }
  };

  /**
   * Use RTK Query hooks to fetch data directly
   * The data is automatically cached and available across all components
   */
  const {
    data: addresses = [],
    isLoading: isLoadingAddresses,
    error: errorAddresses,
    refetch: refetchAddresses,
  } = useFetchAllUserAddressesQuery();


  /** Hydrate auth user from SecureStore when Redux state is empty. */
  useEffect(() => {
    const loadUserFromStorage = async () => {
      if (!user && !userFromStorage) {
        try {
          const storedUser = await getUserFromStorage();
          if (storedUser) {
            setUserFromStorage(storedUser);
          }
        } catch (error) {
        }
      }
    };

    loadUserFromStorage();
  }, [user, userFromStorage]);

  // Use user from state first, then fallback to storage
  const currentUser = user || userFromStorage;

  // Merge API profile over auth user so business_name and other server fields are available
  const userProfile: UserProfileProps = React.useMemo(() => {
    const base = {
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      phone: currentUser?.phone || "",
      is_fleet_owner: currentUser?.is_fleet_owner || false,
      is_branch_admin: currentUser?.is_branch_admin || false,
      is_dealership: currentUser?.is_dealership || false,
      address: (currentUser?.address as UserProfileProps["address"]) ?? null,
      push_notification_token: currentUser?.push_notification_token ?? false,
      email_notification_token: currentUser?.email_notification_token ?? false,
      marketing_email_token: currentUser?.marketing_email_token ?? false,
      loyalty_tier: currentUser?.loyalty_tier || "",
      loyalty_benefits: currentUser?.loyalty_benefits || undefined,
      business_name: currentUser?.business_name || "",
      partner_referral_code: currentUser?.partner_referral_code,
      managed_branch: currentUser?.managed_branch,
    };
    if (profile && typeof profile === "object") {
      return {
        ...base,
        ...profile,
        address: profile.address ?? base.address,
      };
    }
    return base;
  }, [currentUser, profile]);

  /**
   * Collect a new user address field and store it in the newAddress state, for use.
   *
   * @param field is of interface MyAddressProps which contains the fields to be collected
   * @param value is the value of the field to be collected
   */
  const collectNewAddress = (field: keyof MyAddressProps, value: string | number) => {
    const currentAddress = newAddress || {
      address: "",
      post_code: "",
      city: "",
      country: "",
    };
    dispatch(setNewAddress({ ...currentAddress, [field]: value }));
  };

  /**
   * Set the full address from Google Places (includes latitude and longitude).
   */
  const setFullNewAddress = useCallback(
    (result: {
      address: string;
      post_code: string;
      city: string;
      country: string;
      latitude: number;
      longitude: number;
    }) => {
      dispatch(
        setNewAddress({
          address: result.address,
          post_code: result.post_code,
          city: result.city,
          country: result.country,
          latitude: result.latitude,
          longitude: result.longitude,
        })
      );
    },
    [dispatch]
  );

  /**
   * Save a new address to the user's profile on the server.
   * Validates the address data, sends it to the server, and updates the local state.
   *
   * Before sending the address to the server, check if the address is already in the
   * user's profile.
   * @returns Promise<boolean> - Returns true if address was saved successfully, false otherwise
   */
  const saveNewAddress = useCallback(async () => {
    // Validate that newAddress exists and has required fields
    if (!newAddress || !validateForm()) {
      setAlertConfig({
        title: "Error",
        message: "No address data to save",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return;
    }
    /* Ensure that the address is not already in the database.
     * Show an alert to warn the user and terminate the process.
     */
    const isDuplicate = addresses.some(
      (address: MyAddressProps) =>
        address.address.toLowerCase() === newAddress.address.toLowerCase() &&
        (address.post_code || "").toLowerCase() ===
          (newAddress.post_code || "").toLowerCase() &&
        address.city.toLowerCase() === newAddress.city.toLowerCase() &&
        address.country.toLowerCase() === newAddress.country.toLowerCase()
    );
    if (isDuplicate) {
      setAlertConfig({
        title: "Error",
        message: "This address already exists",
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return;
    }

    try {
      /* Geocode manual entries that don't have lat/long */
      let addressToSave = { ...newAddress };
      if (
        (addressToSave.latitude == null || addressToSave.longitude == null) &&
        addressToSave.address
      ) {
        const fullAddress = [
          addressToSave.address,
          addressToSave.city,
          addressToSave.post_code,
          addressToSave.country,
        ]
          .filter(Boolean)
          .join(", ");
        if (fullAddress) {
          try {
            const results = await Location.geocodeAsync(fullAddress);
            if (results.length > 0) {
              addressToSave = {
                ...addressToSave,
                latitude: results[0].latitude,
                longitude: results[0].longitude,
              };
            }
          } catch {
            /* Continue without lat/long if geocoding fails */
          }
        }
      }

      const response = await addNewAddress(addressToSave).unwrap();

      if (response && response.id && response.address) {
        showSnackbarWithConfig({
          message: "Address added successfully",
          type: "success",
          duration: 3000,
        });
        // RTK Query will automatically update the cache
        refetchAddresses();
        dispatch(clearNewAddress());
      }
    } catch (error: any) {
      // Handle different types of errors
      let errorMessage = "Failed to save address. Please try again.";

      if (error?.data?.error) {
        errorMessage = error.data.error;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.status === 400) {
        errorMessage = "Invalid address data. Please check your input.";
      } else if (error?.status === 401) {
        errorMessage = "You must be logged in to save an address.";
      } else if (error?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      }

      setAlertConfig({
        title: "Error",
        message: errorMessage,
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
      return;
    }
  }, [
    addNewAddress,
    addresses,
    dispatch,
    newAddress,
    setAlertConfig,
    setIsVisible,
    refetchAddresses,
    showSnackbarWithConfig,
  ]);

  /**
   * Delete an existing address from the user's profile on the server.
   * Validates the address data, sends it to the server, and updates the local state.
   *
   * @param id is the id of the address to delete
   * @returns none
   * Display an alert to the user when the address is deleted successfully or when an error occurs.
   */
  const deleteAddress = async (id: string) => {
    try {
      const response = await deleteExistingAddress(id).unwrap();
      if (response.id && response.message) {
        setAlertConfig({
          title: "Address Deleted",
          message: response.message,
          type: "success",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
            // RTK Query will automatically update the cache
            refetchAddresses();
          },
        });
      }
    } catch (error: any) {
      let errorMessage = "Failed to delete address. Please try again.";
      if (error?.data?.error) {
        errorMessage = error.data.error;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.status === 400) {
        errorMessage = "Invalid address data. Please check your input.";
      } else if (error?.status === 401) {
        errorMessage = "You must be logged in to delete an address.";
      } else if (error?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      }
      setAlertConfig({
        title: "Error",
        message: errorMessage,
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
    }
  };

  /**
   * Validates the form before saving sending it to the server.
   * Address, city, and country are required. Post code is optional.
   * @returns boolean
   */
  const validateForm = (): boolean => {
    if (!newAddress?.address?.trim()) {
      return false;
    }
    if (!newAddress.city?.trim()) {
      return false;
    }
    if (!newAddress.country?.trim()) {
      return false;
    }
    return true;
  };

  /**
   * Edit an existing address in the user's profile on the server.
   * Validates the address data, sends it to the server, and updates the local state.
   *
   * @param id is the id of the address to edit
   * @param address is the address data to edit
   * @returns none
   * Display an alert to the user when the address is edited successfully or when an error occurs.
   */
  const editAddress = async (id: string, address: MyAddressProps) => {
    try {
      const response = await updateExistingAddress({ id, address }).unwrap();
      if (response.address) {
        setAlertConfig({
          title: "Address Edited",
          message: "You have successfully edited the address",
          type: "success",
          isVisible: true,
          onConfirm: () => {
            setIsVisible(false);
            // RTK Query will automatically update the cache
            refetchAddresses();
          },
        });
      }
    } catch (error: any) {
      let errorMessage = "Failed to edit address. Please try again.";
      if (error?.data?.error) {
        errorMessage = error.data.error;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.status === 400) {
        errorMessage = "Invalid address data. Please check your input.";
      } else if (error?.status === 401) {
        errorMessage = "You must be logged in to edit an address.";
      } else if (error?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      }
      setAlertConfig({
        title: "Error",
        message: errorMessage,
        type: "error",
        isVisible: true,
        onConfirm: () => {
          setIsVisible(false);
        },
      });
    }
  };

  /**
   * Update user profile on the server (personal and optionally business info).
   * Updates auth state and secure storage on success.
   */
  const updateProfilePayload = useCallback(
    async (
      payload: Partial<
        Pick<UserProfileProps, "name" | "phone" | "email" | "business_name">
      >
    ) => {
      try {
        const result = await updateProfileMutation(payload).unwrap();
        if (result?.profile) {
          dispatch(setUser(result.profile));
          await updateUserInStorage(result.profile);
          refetchUserProfile();
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    },
    [updateProfileMutation, dispatch, refetchUserProfile]
  );

  return {
    userProfile,
    addresses,
    collectNewAddress,
    setFullNewAddress,
    newAddress,
    saveNewAddress,
    deleteAddress,
    editAddress,
    updatePushNotificationSetting,
    updateEmailNotificationSetting,
    updateMarketingEmailSetting,
    isLoadingAddAddress,
    isLoadingDeleteAddress,
    isLoadingUpdateAddress,
    isLoadingAddresses,
    isLoadingUserProfile,
    isLoadingUpdatePushNotificationToken,
    isLoadingUpdateEmailNotificationToken,
    isLoadingUpdateMarketingEmailToken,
    errorAddAddress,
    errorDeleteAddress,
    errorUpdateAddress,
    errorAddresses,
    errorUserProfile,
    errorUpdatePushNotificationToken,
    errorUpdateEmailNotificationToken,
    errorUpdateMarketingEmailToken,
    refetchAddresses,
    refetchUserProfile,
    updateProfilePayload,
    isUpdatingProfile,
  };
};

export default useProfile;
