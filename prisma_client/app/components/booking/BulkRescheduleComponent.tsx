import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, TouchableOpacity, Modal } from "react-native";
import dayjs from "dayjs";
import { useThemeColor } from "@/hooks/useThemeColor";
import StyledText from "../helpers/StyledText";
import StyledButton from "../helpers/StyledButton";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { API_CONFIG } from "@/constants/Config";
import { useAlertContext } from "@/app/contexts/AlertContext";
import { useRescheduleBulkOrderMutation } from "@/app/store/api/fleetApi";
import type UpcomingAppointmentProps from "@/app/interfaces/DashboardInterfaces";
import BulkOrderConfirmationModal from "./BulkOrderConfirmationModal";
import { formatCurrency } from "@/app/utils/methods";
import { useAppSelector, RootState } from "@/app/store/main_store";

export interface BulkRescheduleComponentProps {
  appointment: UpcomingAppointmentProps;
  onClose: () => void;
  onSuccess: () => void;
}

const BulkRescheduleComponent: React.FC<BulkRescheduleComponentProps> = ({
  appointment,
  onClose,
  onSuccess,
}) => {
  const textColor = useThemeColor({}, "text");
  const cardColor = useThemeColor({}, "cards");
  const borderColor = useThemeColor({}, "borders");
  const primaryColor = useThemeColor({}, "primary");
  const { setAlertConfig } = useAlertContext();

  const [rescheduleBulkOrder, { isLoading: isReschedulingBulk }] = useRescheduleBulkOrderMutation();

  const [rescheduleNewDate, setRescheduleNewDate] = useState("");
  const [rescheduleOptions, setRescheduleOptions] = useState<
    Array<{ window: string; best_start_time: string; estimated_finish_time: string; suggested_team_size: number }>
  | null>(null);
  const [rescheduleSelectedIndex, setRescheduleSelectedIndex] = useState(0);
  const [rescheduleSelectedOption, setRescheduleSelectedOption] = useState<{
    window: string;
    best_start_time: string;
    estimated_finish_time: string;
    suggested_team_size: number;
  } | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleCalendarMonth, setRescheduleCalendarMonth] = useState(() => dayjs().startOf("month"));

  /** When set, show BulkOrderConfirmationModal (reschedule success) with new date/time. */
  const [rescheduleConfirmationPayload, setRescheduleConfirmationPayload] = useState<{
    newDate: string;
    newStartTime: string;
    newEndTime: string;
  } | null>(null);

  const user = useAppSelector((state: RootState) => state.auth.user);

  const bulkRescheduleMonthDays = useMemo(() => {
    const start = rescheduleCalendarMonth.startOf("month").startOf("week");
    const end = rescheduleCalendarMonth.endOf("month").endOf("week");
    const days: dayjs.Dayjs[] = [];
    let d = start;
    while (d.isBefore(end) || d.isSame(end, "day")) {
      days.push(d);
      d = d.add(1, "day");
    }
    return days;
  }, [rescheduleCalendarMonth]);

  const checkBulkRescheduleCapacity = useCallback(async () => {
    if (!rescheduleNewDate.trim()) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Please select a date.",
        type: "error",
        onConfirm: () => setAlertConfig({ isVisible: false, title: "", message: "", type: "error" }),
      });
      return;
    }
    const d = appointment.order_data as Record<string, unknown> | undefined;
    const address = d?.address as { city?: string; country?: string; latitude?: number; longitude?: number } | undefined;
    const duration = (appointment.service_type?.duration ?? 60) as number;
    const workloadMinutes = (appointment.number_of_vehicles ?? 0) * duration;
    const city = address?.city ?? "";
    const country = address?.country ?? "Ireland";
    setRescheduleLoading(true);
    setRescheduleOptions(null);
    try {
      const url = new URL(`${API_CONFIG.detailerAppUrl}/api/v1/availability/check_bulk_capacity/`);
      url.searchParams.append("date", rescheduleNewDate.trim().slice(0, 10));
      url.searchParams.append("workload_minutes", String(workloadMinutes));
      url.searchParams.append("service_duration", String(duration));
      url.searchParams.append("country", country);
      url.searchParams.append("city", city);
      if (address?.latitude != null && address?.longitude != null) {
        url.searchParams.append("latitude", String(address.latitude));
        url.searchParams.append("longitude", String(address.longitude));
      }
      const response = await fetch(url.toString(), { method: "GET", headers: { "Content-Type": "application/json" } });
      const data = await response.json();
      if (data.error || !data.available) {
        setAlertConfig({
          isVisible: true,
          title: "No capacity",
          message: data.error || "No availability for this date. Try another.",
          type: "error",
          onConfirm: () => setAlertConfig({ isVisible: false, title: "", message: "", type: "error" }),
        });
        return;
      }
      if (data.options && data.options.length > 0) {
        setRescheduleOptions(data.options);
        setRescheduleSelectedOption(data.options[0]);
        setRescheduleSelectedIndex(0);
      } else {
        setAlertConfig({
          isVisible: true,
          title: "No capacity",
          message: "No time options for this date.",
          type: "error",
          onConfirm: () => setAlertConfig({ isVisible: false, title: "", message: "", type: "error" }),
        });
      }
    } catch (e) {
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: "Unable to check availability.",
        type: "error",
        onConfirm: () => setAlertConfig({ isVisible: false, title: "", message: "", type: "error" }),
      });
    } finally {
      setRescheduleLoading(false);
    }
  }, [appointment, rescheduleNewDate, setAlertConfig]);

  const confirmBulkReschedule = useCallback(async () => {
    const selected = rescheduleOptions?.[rescheduleSelectedIndex] ?? rescheduleSelectedOption;
    if (!rescheduleNewDate.trim() || !selected) return;
    try {
      await rescheduleBulkOrder({
        bulk_order_id: appointment.bulk_order_id,
        booking_reference: appointment.booking_reference,
        new_date: rescheduleNewDate.trim().slice(0, 10),
        start_time: selected.best_start_time,
        end_time: selected.estimated_finish_time,
        number_of_vehicles: appointment.number_of_vehicles ?? 0,
        suggested_team_size: selected.suggested_team_size,
      }).unwrap();
      setRescheduleConfirmationPayload({
        newDate: rescheduleNewDate.trim().slice(0, 10),
        newStartTime: selected.best_start_time,
        newEndTime: selected.estimated_finish_time,
      });
    } catch (err: unknown) {
      const e = err as { data?: { error?: string } };
      setAlertConfig({
        isVisible: true,
        title: "Error",
        message: e?.data?.error || "Failed to reschedule",
        type: "error",
        onConfirm: () => setAlertConfig({ isVisible: false, title: "", message: "", type: "error" }),
      });
    }
  }, [
    appointment,
    rescheduleNewDate,
    rescheduleOptions,
    rescheduleSelectedIndex,
    rescheduleSelectedOption,
    rescheduleBulkOrder,
    setAlertConfig,
    onSuccess,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: cardColor }]}>
      <StyledText variant="titleMedium" style={[styles.title, { color: textColor }]}>
        Choose new date
      </StyledText>
      <StyledText variant="bodySmall" style={[styles.subtitle, { color: textColor }]}>
        Tap a date, then check availability for that day.
      </StyledText>
      <View style={styles.calendarWrap}>
        <AvailabilityCalendar
          currentMonth={rescheduleCalendarMonth}
          currentYear={rescheduleCalendarMonth.year()}
          monthDays={bulkRescheduleMonthDays}
          selectedDates={rescheduleNewDate ? [rescheduleNewDate] : []}
          onDatePress={(dateString) => {
            setRescheduleNewDate(dateString);
            setRescheduleOptions(null);
          }}
          onPreviousMonth={() => setRescheduleCalendarMonth((m) => m.subtract(1, "month"))}
          onNextMonth={() => setRescheduleCalendarMonth((m) => m.add(1, "month"))}
          disabledDates={[]}
        />
      </View>
      {rescheduleNewDate ? (
        <StyledText variant="bodySmall" style={[styles.selectedLabel, { color: textColor }]}>
          Selected: {dayjs(rescheduleNewDate).format("dddd, MMM D, YYYY")}
        </StyledText>
      ) : null}
      <View style={styles.actions}>
        <StyledButton
          title={rescheduleLoading ? "Checking…" : "Check availability"}
          variant="small"
          onPress={checkBulkRescheduleCapacity}
          disabled={rescheduleLoading || !rescheduleNewDate}
          isLoading={rescheduleLoading}
        />
      </View>
      {rescheduleOptions && rescheduleOptions.length > 0 && (
        <>
          <StyledText variant="titleSmall" style={[styles.sectionLabel, { color: textColor }]}>
            Select time window
          </StyledText>
          {rescheduleOptions.map((opt, idx) => (
            <TouchableOpacity
              key={idx}
              style={[
                styles.optionRow,
                { borderColor },
                rescheduleSelectedIndex === idx && { backgroundColor: primaryColor + "20" },
              ]}
              onPress={() => {
                setRescheduleSelectedIndex(idx);
                setRescheduleSelectedOption(opt);
              }}
            >
              <StyledText variant="bodySmall" style={{ color: textColor }}>
                {opt.window}: {opt.best_start_time} – {opt.estimated_finish_time}
              </StyledText>
            </TouchableOpacity>
          ))}
          <View style={styles.actions}>
            <StyledButton
              title="Confirm reschedule"
              variant="small"
              onPress={confirmBulkReschedule}
              disabled={isReschedulingBulk}
              isLoading={isReschedulingBulk}
            />
          </View>
        </>
      )}
      <TouchableOpacity style={styles.closeLink} onPress={onClose}>
        <StyledText variant="bodySmall" style={{ color: primaryColor }}>
          Close
        </StyledText>
      </TouchableOpacity>

      {/* Reschedule success – bulk order confirmation modal */}
      {rescheduleConfirmationPayload && (
        <Modal
          visible={true}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setRescheduleConfirmationPayload(null);
            onSuccess();
          }}
        >
          <BulkOrderConfirmationModal
            type="rescheduled"
            bookingReference={appointment.booking_reference}
            numberOfVehicles={appointment.number_of_vehicles ?? 0}
            date={
              (() => {
                const od = appointment.order_data as Record<string, unknown> | undefined;
                const d = od && typeof od.date === "string" ? od.date : appointment.booking_date;
                return typeof d === "string" ? d.slice(0, 10) : "";
              })()
            }
            startTime={
              ((appointment.order_data as Record<string, unknown>)?.start_time as string) ?? appointment.start_time
            }
            endTime={
              ((appointment.order_data as Record<string, unknown>)?.end_time as string) ?? appointment.end_time
            }
            serviceName={appointment.service_type?.name ?? "Bulk service"}
            serviceDurationMinutes={appointment.service_type?.duration}
            address={
              (() => {
                const od = appointment.order_data as Record<string, unknown> | undefined;
                const addr = od?.address as { address?: string; city?: string; post_code?: string; country?: string } | undefined;
                if (addr) return { address: addr.address, city: addr.city, post_code: addr.post_code, country: addr.country };
                const a = appointment.address as { address?: string; city?: string; post_code?: string; country?: string } | undefined;
                return a ? { address: a.address, city: a.city, post_code: a.post_code, country: a.country } : undefined;
              })()
            }
            totalAmount={appointment.total_amount ?? 0}
            newDate={rescheduleConfirmationPayload.newDate}
            newStartTime={rescheduleConfirmationPayload.newStartTime}
            newEndTime={rescheduleConfirmationPayload.newEndTime}
            formatPrice={(amount) => formatCurrency(amount, (user as { address?: { country?: string } })?.address?.country)}
            onClose={() => {
              setRescheduleConfirmationPayload(null);
              onSuccess();
            }}
            onViewDashboard={() => {
              setRescheduleConfirmationPayload(null);
              onSuccess();
            }}
          />
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    opacity: 0.8,
    marginBottom: 12,
  },
  calendarWrap: {
    marginBottom: 12,
  },
  selectedLabel: {
    opacity: 0.9,
    marginBottom: 8,
  },
  actions: {
    marginTop: 8,
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
  },
  optionRow: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  closeLink: {
    marginTop: 16,
    marginBottom: 8,
  },
});

export default BulkRescheduleComponent;
