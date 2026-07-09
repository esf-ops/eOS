export type VisualizerSample = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  accent: string;
};

/** Curated demo spaces bundled as local static SVG assets. */
export const VISUALIZER_SAMPLES: VisualizerSample[] = [
  {
    id: "modern-white",
    title: "Modern white kitchen",
    subtitle: "Bright cabinets · clean lines",
    imageUrl: "/visualizer-samples/modern-white-kitchen.svg",
    accent: "#f8fafc",
  },
  {
    id: "warm-wood",
    title: "Warm wood kitchen",
    subtitle: "Natural tones · cozy feel",
    imageUrl: "/visualizer-samples/warm-wood-kitchen.svg",
    accent: "#d4a574",
  },
  {
    id: "dark-cabinet",
    title: "Dark cabinet kitchen",
    subtitle: "Rich contrast · dramatic light",
    imageUrl: "/visualizer-samples/dark-cabinet-kitchen.svg",
    accent: "#334155",
  },
  {
    id: "island-kitchen",
    title: "Island kitchen",
    subtitle: "Center island · open layout",
    imageUrl: "/visualizer-samples/island-kitchen.svg",
    accent: "#e2e8f0",
  },
  {
    id: "bathroom-vanity",
    title: "Bathroom vanity",
    subtitle: "Compact vanity top",
    imageUrl: "/visualizer-samples/bathroom-vanity.svg",
    accent: "#cbd5e1",
  },
];
