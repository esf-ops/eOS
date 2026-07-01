export type Point = { x: number; y: number };

export type SlabOption = {
  id: string;
  name: string;
  filename: string;
  url: string;
};

export type RenderResponse = {
  render_id: string;
  output_url: string;
  output_filename: string;
  disclaimer: string;
};

export async function fetchSlabs(): Promise<SlabOption[]> {
  const res = await fetch("/api/slabs");
  if (!res.ok) throw new Error("Failed to load slab catalog");
  const data = (await res.json()) as { slabs: SlabOption[] };
  return data.slabs;
}

export async function renderVisualization(params: {
  kitchenFile: File;
  slabId: string;
  points: Point[];
}): Promise<RenderResponse> {
  const form = new FormData();
  form.append("kitchen_image", params.kitchenFile);
  form.append("slab_id", params.slabId);
  form.append("points", JSON.stringify(params.points.map((p) => [p.x, p.y])));

  const res = await fetch("/api/render", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? `Render failed (${res.status})`);
  }
  return (await res.json()) as RenderResponse;
}
