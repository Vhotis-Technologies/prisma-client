import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "@/app/components/helpers/StyledText";
import AddressCard from "@/app/components/profile/AddressCard";
import AddAddressModal from "@/app/components/profile/AddAddressModal";
import ModalServices from "@/app/utils/ModalServices";
import useProfile from "@/app/app-hooks/useProfile";
import { useAppDispatch } from "@/app/store/main_store";
import { clearNewAddress } from "@/app/store/slices/profileSlice";
import { Ionicons } from "@expo/vector-icons";
import StyledButton from "@/app/components/helpers/StyledButton";

const ManageAddressesScreen = () => {
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const iconColor = useThemeColor({}, "icons");

  const dispatch = useAppDispatch();
  const {
    addresses,
    saveNewAddress,
    deleteAddress,
    refetchAddresses,
    isLoadingAddresses,
  } = useProfile();

  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleAddPress = useCallback(() => {
    dispatch(clearNewAddress());
    setModalVisible(true);
  }, [dispatch]);

  const handleSave = useCallback(async () => {
    await saveNewAddress();
    setModalVisible(false);
  }, [saveNewAddress]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteAddress(id);
    },
    [deleteAddress]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchAddresses();
    setRefreshing(false);
  }, [refetchAddresses]);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={primaryColor}
          />
        }
      >
        {isLoadingAddresses ? (
          <View style={styles.centered}>
            <StyledText variant="bodyMedium">Loading addresses...</StyledText>
          </View>
        ) : !addresses?.length ? (
          <View style={[styles.emptyCard, { backgroundColor: cardColor, borderColor }]}>
            <Ionicons name="location-outline" size={48} color={iconColor} />
            <StyledText variant="bodyMedium" style={styles.emptyText}>
              No addresses yet
            </StyledText>
            <StyledText variant="bodySmall" style={styles.emptySubtext}>
              Add an address to use for bookings and deliveries
            </StyledText>
          </View>
        ) : (
          (addresses ?? []).map((addr) => (
            <AddressCard
              key={addr.id ?? addr.address + addr.city}
              address={addr}
              onDelete={handleDelete}
            />
          ))
        )}
      </ScrollView>

      <StyledButton
        title="Add new address"
        onPress={handleAddPress}
        variant="medium"
        style={styles.addButton}
      />

      <ModalServices
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          dispatch(clearNewAddress());
        }}
        modalType="fullscreen"
        animationType="slide"
        showCloseButton
        title="Add new address"
        component={
          <AddAddressModal
            onClose={() => {
              setModalVisible(false);
              dispatch(clearNewAddress());
            }}
            onSave={handleSave}
          />
        }
      />
    </View>
  );
};

export default ManageAddressesScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  centered: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    marginTop: 12,
  },
  emptySubtext: {
    marginTop: 6,
    opacity: 0.8,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 16,
  }
});
