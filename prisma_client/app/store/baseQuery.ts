/**
 * Axios-based base query for RTK Query: auth header, token refresh, public endpoint list.
 * Used by all createApi modules in store/api.
 */
import { fetchBaseQuery, BaseQueryFn } from "@reduxjs/toolkit/query/react";
import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from "axios";
import * as SecureStore from "expo-secure-store";
import { API_CONFIG } from "@/constants/Config";
import { setIsAuthenticated } from "@/app/store/slices/authSlice";
import { refreshTokenSuccess } from "@/app/store/slices/authSlice";
import { RootState } from "@/app/store/main_store";
import { Platform } from "react-native";

const axiosInstance = axios.create({
  baseURL: API_CONFIG.customerAppUrl,
  timeout: 30000,
});

export const axiosBaseQuery = (): BaseQueryFn => {
  return async ({ url, method, data, params, headers }, api, extraOptions) => {
    try {
      // Get access token from state using api.getState()
      const state = api.getState() as RootState;
      const access =
        state.auth.access || (await SecureStore.getItemAsync("access"));

      // List of endpoints that don't require authentication
      const publicEndpoints = [
        "/api/v1/authentication/login/",
        "/api/v1/authentication/refresh/",
      ];

      // Check if data is FormData (React Native compatible check)
      const isFormData =
        data instanceof FormData ||
        (data &&
          typeof data === "object" &&
          data.constructor &&
          data.constructor.name === "FormData") ||
        (data && typeof data === "object" && "_parts" in data);

      // For FormData in React Native, use fetch API instead of axios
      // Axios has issues with React Native FormData serialization
      if (isFormData && Platform.OS !== "web") {
        // Build URL with params
        let fullUrl = `${API_CONFIG.customerAppUrl}${url}`;
        if (params) {
          const queryString = new URLSearchParams(params as any).toString();
          fullUrl += `?${queryString}`;
        }

        // Build headers
        const requestHeaders: HeadersInit = {};
        if (access && !publicEndpoints.includes(url || "")) {
          requestHeaders.Authorization = `Bearer ${access}`;
        }
        // Don't set Content-Type - fetch will set it automatically with boundary

        const response = await fetch(fullUrl, {
          method: method || "GET",
          headers: requestHeaders,
          body: data as FormData,
        });

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = await response.text();
          }

          // Handle 401 errors with token refresh
          if (response.status === 401) {
            try {
              const state = api.getState() as RootState;
              const refreshToken =
                state.auth.refresh ||
                (await SecureStore.getItemAsync("refresh"));

              if (!refreshToken) {
                api.dispatch(setIsAuthenticated(false));
                return {
                  error: {
                    status: 401,
                    data: "Authentication failed - no refresh token",
                  },
                };
              }

              // Try to refresh the token using axios
              const refreshResponse = await axiosInstance.post(
                "/api/v1/authentication/refresh/",
                {
                  refresh: refreshToken,
                }
              );

              const { access, refresh } = refreshResponse.data;
              await SecureStore.setItemAsync("access", access);
              await SecureStore.setItemAsync("refresh", refresh);

              // Update the store with new tokens
              api.dispatch(setIsAuthenticated(true));
              api.dispatch(refreshTokenSuccess({ access, refresh }));

              // Retry the original request with the new token
              const retryHeaders: HeadersInit = {
                Authorization: `Bearer ${access}`,
              };

              const retryResponse = await fetch(fullUrl, {
                method: method || "GET",
                headers: retryHeaders,
                body: data as FormData,
              });

              if (!retryResponse.ok) {
                let retryErrorData;
                try {
                  retryErrorData = await retryResponse.json();
                } catch {
                  retryErrorData = await retryResponse.text();
                }
                return {
                  error: {
                    status: retryResponse.status,
                    data: retryErrorData,
                  },
                };
              }

              let retryResponseData;
              try {
                retryResponseData = await retryResponse.json();
              } catch {
                retryResponseData = await retryResponse.text();
              }

              return {
                data: retryResponseData,
                meta: {
                  response: retryResponse,
                },
              };
            } catch (refreshError) {
              // If refresh fails, logout the user
              api.dispatch(setIsAuthenticated(false));
              return {
                error: {
                  status: 401,
                  data: "Authentication failed",
                },
              };
            }
          }

          return {
            error: {
              status: response.status,
              data: errorData,
            },
          };
        }

        let responseData;
        try {
          responseData = await response.json();
        } catch {
          responseData = await response.text();
        }

        return {
          data: responseData,
          meta: {
            response: response,
          },
        };
      }

      // For non-FormData requests, use axios as before
      // Build headers with authentication if needed
      const requestHeaders = { ...headers };
      if (access && !publicEndpoints.includes(url || "")) {
        requestHeaders.Authorization = `Bearer ${access}`;
      }

      // Set Content-Type header based on data type
      if (data && typeof data === "object" && !requestHeaders["Content-Type"]) {
        requestHeaders["Content-Type"] = "application/json";
      }

      const config: AxiosRequestConfig = {
        url,
        method,
        data,
        params,
        headers: requestHeaders,
      };

      const response: AxiosResponse = await axiosInstance(config);

      return {
        data: response.data,
        meta: {
          response: response,
        },
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      // Handle 401 errors with token refresh
      if (axiosError.response?.status === 401) {
        try {
          const state = api.getState() as RootState;
          const refreshToken =
            state.auth.refresh || (await SecureStore.getItemAsync("refresh"));

          if (!refreshToken) {
            api.dispatch(setIsAuthenticated(false));
            return {
              error: {
                status: 401,
                data: "Authentication failed - no refresh token",
              },
            };
          }

          // Try to refresh the token
          const refreshResponse = await axiosInstance.post(
            "/api/v1/authentication/refresh/",
            {
              refresh: refreshToken,
            }
          );

          const { access, refresh } = refreshResponse.data;
          await SecureStore.setItemAsync("access", access);
          await SecureStore.setItemAsync("refresh", refresh);

          // Update the store with new tokens using api.dispatch()
          api.dispatch(setIsAuthenticated(true));
          api.dispatch(refreshTokenSuccess({ access, refresh }));

          // Retry the original request with the new token
          const retryHeaders = { ...headers };
          retryHeaders.Authorization = `Bearer ${access}`;

          const retryConfig: AxiosRequestConfig = {
            url,
            method,
            data,
            params,
            headers: retryHeaders,
          };

          const retryResponse: AxiosResponse = await axiosInstance(retryConfig);

          return {
            data: retryResponse.data,
            meta: {
              response: retryResponse,
            },
          };
        } catch (refreshError) {
          // If refresh fails, logout the user
          api.dispatch(setIsAuthenticated(false));
          return {
            error: {
              status: 401,
              data: "Authentication failed",
            },
          };
        }
      }

      // Return other errors as normal
      return {
        error: {
          status: axiosError.response?.status,
          data: axiosError.response?.data || axiosError.message,
        },
      };
    }
  };
};

export default axiosBaseQuery;
