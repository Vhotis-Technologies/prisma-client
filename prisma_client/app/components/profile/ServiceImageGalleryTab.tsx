import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import StyledText from "../helpers/StyledText";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useImageDownload } from "@/app/utils/imageDownload";

interface ServiceImageGalleryTabProps {
  images: Array<{ id: number; image_url: string; created_at: string }>;
  bookingReference?: string;
}

const ServiceImageGalleryTab = ({
  images,
  bookingReference,
}: ServiceImageGalleryTabProps) => {
  const { download, share } = useImageDownload();
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [sharingIds, setSharingIds] = useState<Set<number>>(new Set());

  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const textColor = useThemeColor({}, "text");
  const iconColor = useThemeColor({}, "icons");
  const backgroundColor = useThemeColor({}, "background");

  /**
   * Format date with time for timestamp display
   */
  const formatDateTime = (dateString: string) => {
    if (!dateString || dateString.trim() === "") {
      return "N/A";
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }
    return date.toLocaleString("en-IE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Handle image download (available to all users)
   */
  const handleDownload = async (imageUrl: string, imageId: number) => {
    setDownloadingIds((prev) => new Set(prev).add(imageId));
    try {
      await download(imageUrl, bookingReference);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setDownloadingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });
    }
  };

  /**
   * Handle image share
   */
  const handleShare = async (imageUrl: string, imageId: number) => {
    setSharingIds((prev) => new Set(prev).add(imageId));
    try {
      await share(imageUrl, bookingReference);
    } catch (error) {
      console.error("Share error:", error);
    } finally {
      setSharingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });
    }
  };

  if (images.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor }]}>
        <Ionicons name="images-outline" size={64} color={iconColor} />
        <StyledText
          variant="titleMedium"
          style={[styles.emptyTitle, { color: textColor }]}
        >
          No Images Available
        </StyledText>
        <StyledText
          variant="bodyMedium"
          style={[styles.emptyDescription, { color: textColor }]}
        >
          There are no images in this category.
        </StyledText>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.grid}>
        {images.map((image) => {
          const isDownloading = downloadingIds.has(image.id);
          const isSharing = sharingIds.has(image.id);

          return (
            <View
              key={image.id}
              style={[
                styles.imageCard,
                { backgroundColor: cardColor, borderColor },
              ]}
            >
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: image.image_url }}
                  style={styles.image}
                  resizeMode="cover"
                />
                <View style={styles.overlay}>
                  <View style={styles.buttonGroup}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleDownload(image.image_url, image.id)}
                      disabled={isDownloading}
                      activeOpacity={0.7}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <MaterialIcons
                          name="cloud-download"
                          size={20}
                          color="#FFFFFF"
                        />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleShare(image.image_url, image.id)}
                      disabled={isSharing}
                      activeOpacity={0.7}
                    >
                      {isSharing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons
                          name="share-outline"
                          size={20}
                          color="#FFFFFF"
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={styles.timestampContainer}>
                <Ionicons name="time-outline" size={12} color={iconColor} />
                <StyledText
                  variant="bodySmall"
                  style={[styles.timestampText, { color: textColor }]}
                >
                  Taken: {formatDateTime(image.created_at)}
                </StyledText>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

export default ServiceImageGalleryTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 8,
    paddingBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    justifyContent: "space-between",
  },
  imageCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    overflow: "hidden",
  },
  image: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  overlay: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 10,
    paddingTop: 8,
  },
  timestampText: {
    fontSize: 11,
    opacity: 0.8,
    flex: 1,
  },
  restrictionText: {
    fontSize: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: "600",
  },
  emptyDescription: {
    textAlign: "center",
    opacity: 0.7,
  },
});
