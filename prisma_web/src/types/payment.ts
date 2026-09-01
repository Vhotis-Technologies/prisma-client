export type SavedCard = {
  id: string;
  type: string;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
};

export type GiftVoucherSheetResponse = {
  paymentIntent: string;
  paymentIntentId: string;
  giftVoucherId: string;
  currency?: string;
};

export type GiftVoucherPending = {
  recipientEmail: string;
  amount: number;
  validityDays: number;
  currency?: string;
};
