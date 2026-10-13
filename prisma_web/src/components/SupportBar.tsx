import {
  SUPPORT_EMAIL,
  SUPPORT_HOURS_LABEL,
  SUPPORT_PHONE_LABEL,
  SUPPORT_PHONE_TEL,
} from "../lib/supportPhone";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Thin top strip: email, opening hours, phone on one line. */
export default function SupportBar() {
  return (
    <div className="support-bar">
      <a className="support-bar-item" href={`mailto:${SUPPORT_EMAIL}`}>
        <svg {...iconProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
        <span>{SUPPORT_EMAIL}</span>
      </a>
      <span className="support-bar-item">
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>{SUPPORT_HOURS_LABEL}</span>
      </span>
      <a className="support-bar-item" href={`tel:${SUPPORT_PHONE_TEL}`}>
        <svg {...iconProps}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
        <span>{SUPPORT_PHONE_LABEL}</span>
      </a>
    </div>
  );
}
