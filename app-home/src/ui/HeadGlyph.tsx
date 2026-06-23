/** Inline SVG glyph per launcher head slug — presentational only. */
export default function HeadGlyph({ slug }: { slug: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (slug) {
    case "quote":
      return (
        <svg {...common}>
          <path d="M4 19l4-1 11-11a1.8 1.8 0 0 0 0-2.5l-.5-.5a1.8 1.8 0 0 0-2.5 0L5 15l-1 4Z" />
          <path d="M14.5 6.5l3 3" />
        </svg>
      );
    case "quote_library":
      return (
        <svg {...common}>
          <path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" />
          <path d="M9 8h6" />
          <path d="M9 12h4" />
        </svg>
      );
    case "pricing_admin":
      return (
        <svg {...common}>
          <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" />
          <circle cx="8" cy="8" r="1.6" />
        </svg>
      );
    case "system_admin":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.28 16.93l.06-.06A1.7 1.7 0 0 0 4.68 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.28l.06.06a1.7 1.7 0 0 0 1.87.34h.07a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.07a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
        </svg>
      );
    case "public_quote":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18Z" />
        </svg>
      );
    case "partner_quote":
      return (
        <svg {...common}>
          <path d="M3 10l4-4 4 4 4-4 4 4-4 4-4-4-4 4-4-4Z" />
          <path d="M11 14l3 3" />
        </svg>
      );
    case "dealer_resources":
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Z" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      );
    case "executive":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-5" />
        </svg>
      );
    case "brain_health":
      return (
        <svg {...common}>
          <path d="M3 12h4l2-5 4 10 2-5h6" />
        </svg>
      );
    case "sales":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-9" />
          <path d="M14 6h7v7" />
        </svg>
      );
    case "production":
      return (
        <svg {...common}>
          <path d="M3 7l9-4 9 4-9 4-9-4Z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
      );
    case "shop_tv":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="12" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case "install":
    case "install_dashboard":
      return (
        <svg {...common}>
          <path d="M14 4l6 6-3 3-3-3-7 7H4v-3l7-7-3-3 3-3Z" />
        </svg>
      );
    case "slab_inventory":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 15h3" />
          <path d="M13 15h3" />
        </svg>
      );
    case "purchasing":
      return (
        <svg {...common}>
          <path d="M3 4h2l2 12h12l2-8H7" />
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
        </svg>
      );
    case "customer_service":
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 1 1-3.4-6.8" />
          <path d="M21 4v5h-5" />
          <path d="M8 13a4 4 0 0 0 8 0" />
        </svg>
      );
    case "hr":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20a6 6 0 0 1 12 0" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M15 20a4 4 0 0 1 6-3.5" />
        </svg>
      );
    case "safety":
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6a8 8 0 0 1-8 9 8 8 0 0 1-8-9V6l8-3Z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "marketing":
      return (
        <svg {...common}>
          <path d="M3 11l16-7v16L3 13v-2Z" />
          <path d="M7 13v6" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <path d="M12 2v20" />
          <path d="M17 6.5a4 4 0 0 0-4-2.5h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2a4 4 0 0 1-4-2.5" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          <path d="M14 3v5h5" />
          <path d="M8 14h8" />
          <path d="M8 18h5" />
        </svg>
      );
    case "org_directory":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10" />
          <path d="M7 13h7" />
          <path d="M7 17h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      );
  }
}
