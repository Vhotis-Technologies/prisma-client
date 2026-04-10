/**
 * Auth API: login, register, refresh token, logout. Uses axiosBaseQuery with token attachment.
 */
import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../baseQuery";
import { UserProfileProps } from "@/app/interfaces/ProfileInterfaces";
const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    /**
     * Login a user using the api to access the url on the server.
     * The credential passed in the body is the {UserProfileProps} which is the users main
     * data
     */
    login: builder.mutation({
      query: (credentials) => ({
        url: "/api/v1/authentication/login/",
        method: "POST",
        data: credentials,
      }),
    }),

    /**
     * Register a new user using the api to access the url on the server.
     * The credential passed in the body is the {UserProfileProps} which is the users main
     * data
     */
    register: builder.mutation({
      query: (credentials) => ({
        url: "/api/v1/onboard/create_new_account/",
        method: "POST",
        data: { credentials: credentials },
      }),
    }),

    /**
     * Refresh the access token using the api to access the url on the server.
     * The credential passed in the body is the {UserProfileProps} which is the users main
     * data
     */
    refreshToken: builder.mutation({
      query: (credentials) => ({
        url: "/api/v1/authentication/refresh/",
        method: "POST",
        data: credentials,
      }),
    }),

    /**
     * Get the terms and conditions from the server.
     */
    getTermsAndConditions: builder.query<
      { version: string; content: string; last_updated: string },
      void
    >({
      query: () => ({
        url: "/api/v1/terms/get_terms/",
        method: "GET",
      }),
    }),

    /**
     * Get the privacy policy from the server.
     */
    getPrivacyPolicy: builder.query<
      { version: string; content: string; last_updated: string },
      void
    >({
      query: () => ({
        url: "/api/v1/terms/get_privacy_policy/",
        method: "GET",
      }),
    }),

    /**
     * Request password reset email.
     */
    requestPasswordReset: builder.mutation<
      { message: string },
      { email: string }
    >({
      query: ({ email }) => ({
        url: "/api/v1/auth/password-reset/",
        method: "POST",
        data: { email },
      }),
    }),

    /**
     * Validate password reset token.
     */
    validateResetToken: builder.mutation<
      {
        valid: boolean;
        message: string;
        expires_at: string;
        user_email: string;
      },
      { token: string }
    >({
      query: ({ token }) => ({
        url: "/api/v1/auth/validate-reset-token/",
        method: "POST",
        data: { token },
      }),
    }),

    /**
     * Reset password with token.
     */
    resetPassword: builder.mutation<
      {
        message: string;
        access: string;
        refresh: string;
        user: UserProfileProps;
      },
      { token: string; password: string }
    >({
      query: ({ token, password }) => ({
        url: "/api/v1/auth/reset-password/",
        method: "POST",
        data: { token, password },
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useRefreshTokenMutation,
  useGetTermsAndConditionsQuery,
  useGetPrivacyPolicyQuery,
  useRequestPasswordResetMutation,
  useValidateResetTokenMutation,
  useResetPasswordMutation,
} = authApi;
export default authApi;
