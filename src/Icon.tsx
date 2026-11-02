export type IconName =
  | "today"
  | "direction"
  | "reflect"
  | "review"
  | "settings"
  | "sync"
  | "chevron"
  | "check";
const paths: Record<IconName, string[]> = {
  chevron: ["m9 5 7 7-7 7"],
  check: ["m5 12 4 4 10-10"],
  today: [
    "M8 3v4M16 3v4M4 10h16",
    "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
    "m8 15 2 2 5-5",
  ],
  direction: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "m16 8-3 5-5 3 3-5 5-3Z",
  ],
  reflect: ["M12 3a9 9 0 1 0 9 9", "M10 9v6M14 9v6"],
  review: ["M4 6v5h5", "M4 11a8 8 0 1 1 1 7", "M12 8v5l3 2"],
  settings: [
    "M9 4h6l1 3 3 1 1 3-2 2v3l-3 2h-3l-2 2-3-1-1-3-3-1v-4l3-2 1-3Z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ],
  sync: [
    "M20 8a8 8 0 0 0-14-2L3 9",
    "M3 4v5h5",
    "M4 16a8 8 0 0 0 14 2l3-3",
    "M16 15h5v5",
  ],
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name].map((path, i) => (
        <path key={i} d={path} />
      ))}
    </svg>
  );
}
