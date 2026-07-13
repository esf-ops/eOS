export type DemoRoom = {
  id: string;
  label: string;
  imageUrl: string;
  subtitle?: string;
};

/** Real kitchen photos for optional “Try a demo room” — not the primary flow. */
export const DEMO_ROOMS: DemoRoom[] = [
  {
    id: "modern-kitchen",
    label: "Bright kitchen",
    imageUrl: "/demo-rooms/modern-kitchen.jpg",
  },
  {
    id: "classic-kitchen",
    label: "Classic kitchen",
    imageUrl: "/demo-rooms/classic-kitchen.jpg",
  },
];

/**
 * Cambria visualizer mode only — curated Cambria kitchen/bath scenes.
 * No preset masks: samples load as room photos into the normal upload → render flow.
 */
export const CAMBRIA_DEMO_ROOMS: DemoRoom[] = [
  {
    id: "cambria-bathroom",
    label: "Bathroom",
    subtitle: "Bath vanity and wall surface",
    imageUrl: "/samples/cambria/cambria-bathroom.jpg",
  },
  {
    id: "cambria-ironsbridge-kitchen",
    label: "Ironsbridge Kitchen",
    subtitle: "Warm Cambria kitchen scene",
    imageUrl: "/samples/cambria/cambria-ironsbridge-kitchen.jpg",
  },
  {
    id: "cambria-claremont-kitchen",
    label: "Claremont Kitchen",
    subtitle: "Bright kitchen with island",
    imageUrl: "/samples/cambria/cambria-claremont-kitchen.jpg",
  },
  {
    id: "cambria-traymore-bay-kitchen",
    label: "Traymore Bay Kitchen",
    subtitle: "Luxury kitchen preview",
    imageUrl: "/samples/cambria/cambria-traymore-bay-kitchen.jpg",
  },
];

export function getVisualizerDemoRooms(mode: "default" | "cambria" = "default"): DemoRoom[] {
  return mode === "cambria" ? CAMBRIA_DEMO_ROOMS : DEMO_ROOMS;
}
