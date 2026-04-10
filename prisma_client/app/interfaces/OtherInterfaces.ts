/**
 * Shared types: detailer profile, return booking props (used across booking and dashboard).
 */
export default interface DetailerProfileProps {
  id?: string;
  name: string;
  rating: number;
  phone?: string;
}

export interface ReturnBookingProps {
  success: boolean;
}
