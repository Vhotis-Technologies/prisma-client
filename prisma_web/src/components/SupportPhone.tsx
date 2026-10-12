import { SUPPORT_PHONE_LABEL, SUPPORT_PHONE_TEL } from "../lib/supportPhone";

export default function SupportPhone() {
  return (
    <a className="support-phone" href={`tel:${SUPPORT_PHONE_TEL}`}>
      {SUPPORT_PHONE_LABEL}
    </a>
  );
}
