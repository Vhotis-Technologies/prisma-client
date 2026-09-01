export type HistoryAddress = {
  id?: string;
  address: string;
  post_code: string;
  city: string;
  country: string;
};

export type HistoryDetailer = {
  id: string;
  name: string;
  rating: number;
  phone?: string;
};

export type HistoryItem = {
  id: string;
  booking_date: string;
  appointment_date: string;
  service_type: string;
  valet_type: string;
  vehicle_reg: string;
  address: HistoryAddress;
  detailer: HistoryDetailer;
  detailers?: HistoryDetailer[];
  status: string;
  total_amount: number;
  rating: number;
  is_reviewed: boolean;
  booking_reference: string;
};

export type HistoryImage = {
  id: string;
  image_url: string;
  created_at: string;
};

export type BookingImages = {
  booking_reference: string;
  before_images_interior: HistoryImage[];
  before_images_exterior: HistoryImage[];
  after_images_interior: HistoryImage[];
  after_images_exterior: HistoryImage[];
  access_denied?: boolean;
  download_allowed?: boolean;
  view_only?: boolean;
  message?: string;
  is_watermarked?: boolean;
};

export type ImageTab = "before-interior" | "after-interior" | "before-exterior" | "after-exterior";
