export type DemoRoom = {
  id: string;
  label: string;
  imageUrl: string;
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
