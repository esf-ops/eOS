"use client";

import { notFound, useParams } from "next/navigation";
import { ToolWorkspace } from "@/components/ai/ToolWorkspace";
import { asWorkspaceTool, getClientToolBySlug } from "@/lib/ai-tools/client-catalog";
import { useFavorites, useHistory } from "@/lib/hooks";

export default function ToolPage() {
  const params = useParams<{ slug: string }>();
  const clientTool = getClientToolBySlug(String(params.slug ?? ""));
  const { isFavorite, toggle } = useFavorites();
  const { add } = useHistory();

  if (!clientTool || clientTool.status !== "live") {
    notFound();
  }

  const tool = asWorkspaceTool(clientTool);

  return (
    <ToolWorkspace
      tool={tool}
      favorite={isFavorite(tool.id)}
      onToggleFavorite={() => toggle(tool.id)}
      onGenerationComplete={({ generationId, content }) => {
        add({
          id: generationId,
          toolId: tool.id,
          toolSlug: tool.slug,
          toolTitle: tool.title,
          title: `${tool.title} · ${new Date().toLocaleString()}`,
          result: content.slice(0, 4000),
          timestamp: new Date().toISOString(),
        });
      }}
    />
  );
}
