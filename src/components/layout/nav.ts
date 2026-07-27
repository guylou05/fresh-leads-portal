export type NavItem = {
  label: string;
  href: string;
  /** Inline SVG path data (24x24 viewBox, currentColor stroke). */
  icon: string;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10",
  },
  {
    label: "Imports",
    href: "/imports",
    icon: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2",
  },
  {
    label: "Leads",
    href: "/leads",
    icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z",
  },
  {
    label: "Follow-ups",
    href: "/leads/follow-ups",
    icon: "M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  },
  {
    label: "Enrichment",
    href: "/enrichment",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    label: "AI Analysis",
    href: "/ai",
    icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c.251.023.501.05.75.082m-.75-.082a24.301 24.301 0 00-4.5 0m0 0v5.714a2.25 2.25 0 01-.659 1.591L2 14.5m0 0a24.02 24.02 0 018 2m10-8.396c.251.023.501.05.75.082M14.25 3.104a24.3 24.3 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L22 14.5",
  },
  {
    label: "Segments",
    href: "/segments",
    icon: "M11 3.055A9 9 0 1020.945 13H11V3.055zM20.488 9A9.004 9.004 0 0015 3.512V9h5.488z",
  },
  {
    label: "Exports",
    href: "/exports",
    icon: "M12 21V9m0 0l-4 4m4-4l4 4M4 5h16",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];
