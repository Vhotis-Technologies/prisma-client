/**
 * Image download/save/share: download image from URL, save to media library or share. Uses Expo FileSystem, MediaLibrary, Sharing.
 */
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useSnackbar } from "@/app/contexts/SnackbarContext";

/** Extract a safe file extension from a URL (e.g. jpg, png). Avoids path/query ending up in the filename. */
function getSafeImageExtension(imageUrl: string): string {
  try {
    const pathname = imageUrl.split("?")[0] || "";
    const lastSegment = pathname.split("/").pop() || "";
    const ext = (lastSegment.split(".").pop() || "").toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch (_) {}
  return "jpg";
}

/**
 * Downloads an image from a URL and saves it to the device photo library.
 * Does not open the share dialog — saves directly to Photos/Camera Roll.
 *
 * @param imageUrl - The URL of the image to download
 * @param bookingReference - Optional booking reference for filename
 * @param showSnackbarWithConfig - Optional snackbar function for showing success/error messages
 * @returns Promise<boolean> - True if download was successful
 */
export const downloadImage = async (
  imageUrl: string,
  bookingReference?: string,
  showSnackbarWithConfig?: (config: {
    message: string;
    type: "success" | "error" | "info";
    duration?: number;
  }) => void
): Promise<boolean> => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ref = bookingReference ? `_${bookingReference}` : "";
    const fileExtension = getSafeImageExtension(imageUrl);
    const finalFilename = `service_image${ref}_${timestamp}.${fileExtension}`;
    const fileUri = `${FileSystem.cacheDirectory}${finalFilename}`;

    const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== "granted") {
      if (showSnackbarWithConfig) {
        showSnackbarWithConfig({
          message: "Permission to save photos is required to download images.",
          type: "error",
          duration: 4000,
        });
      }
      return false;
    }

    await MediaLibrary.saveToLibraryAsync(downloadResult.uri);

    if (showSnackbarWithConfig) {
      showSnackbarWithConfig({
        message: "Image saved to Photos",
        type: "success",
        duration: 3000,
      });
    }
    return true;
  } catch (error: any) {
    console.error("Error downloading image:", error);
    if (showSnackbarWithConfig) {
      showSnackbarWithConfig({
        message: error?.message || "Failed to download image. Please try again.",
        type: "error",
        duration: 4000,
      });
    }
    return false;
  }
};

/**
 * Shares an image from a URL by downloading it first, then opening the native share dialog
 * 
 * @param imageUrl - The URL of the image to share
 * @param bookingReference - Optional booking reference for filename
 * @param showSnackbarWithConfig - Optional snackbar function for showing success/error messages
 * @returns Promise<boolean> - True if share was successful
 */
export const shareImage = async (
  imageUrl: string,
  bookingReference?: string,
  showSnackbarWithConfig?: (config: {
    message: string;
    type: "success" | "error" | "info";
    duration?: number;
  }) => void
): Promise<boolean> => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ref = bookingReference ? `_${bookingReference}` : "";
    const fileExtension = getSafeImageExtension(imageUrl);
    const finalFilename = `vehicle_image${ref}_${timestamp}.${fileExtension}`;
    const fileUri = `${FileSystem.cacheDirectory}${finalFilename}`;

    // Download the file
    const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    // Check if sharing is available
    const isAvailable = await Sharing.isAvailableAsync();

    if (isAvailable) {
      // Share the file (opens native share dialog)
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: `image/${fileExtension}`,
        dialogTitle: "Share Image",
      });

      if (showSnackbarWithConfig) {
        showSnackbarWithConfig({
          message: "Image shared successfully",
          type: "success",
          duration: 3000,
        });
      }
      return true;
    } else {
      // For platforms where sharing isn't available
      if (showSnackbarWithConfig) {
        showSnackbarWithConfig({
          message: "Sharing is not available on this device",
          type: "error",
          duration: 3000,
        });
      }
      return false;
    }
  } catch (error: any) {
    console.error("Error sharing image:", error);
    if (showSnackbarWithConfig) {
      showSnackbarWithConfig({
        message: error?.message || "Failed to share image. Please try again.",
        type: "error",
        duration: 4000,
      });
    }
    return false;
  }
};

/**
 * Hook wrapper for downloadImage and shareImage that provides snackbar automatically
 */
export const useImageDownload = () => {
  const { showSnackbarWithConfig } = useSnackbar();

  const download = async (
    imageUrl: string,
    bookingReference?: string
  ): Promise<boolean> => {
    return downloadImage(imageUrl, bookingReference, showSnackbarWithConfig);
  };

  const share = async (
    imageUrl: string,
    bookingReference?: string
  ): Promise<boolean> => {
    return shareImage(imageUrl, bookingReference, showSnackbarWithConfig);
  };

  return { download, share };
};

/** Expo Router no-op route (util module, not a screen). */
export default function ImageDownloadRoute() {
  return null;
}
