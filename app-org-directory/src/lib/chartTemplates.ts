import type { ChartData } from "./chartTypes";
import { buildEliteStarterChartData } from "./eliteStarterChart";
import { buildEliteOperatingModelTemplate } from "./eliteOperatingModelTemplate";

export type ChartTemplateId = "basic_starter" | "operating_model";

export type ChartTemplateOption = {
  id: ChartTemplateId;
  name: string;
  description: string;
  build: () => ChartData;
};

export const CHART_TEMPLATES: ChartTemplateOption[] = [
  {
    id: "basic_starter",
    name: "Basic starter chart",
    description: "Compact leadership and branch preview — a light starting point.",
    build: buildEliteStarterChartData
  },
  {
    id: "operating_model",
    name: "Elite operating model template",
    description:
      "Full operating-model buckets with advisory context. A planning starting point — review and adjust before relying on it.",
    build: buildEliteOperatingModelTemplate
  }
];

export const TEMPLATE_REPLACE_CONFIRM =
  "This will replace the current working chart with the selected template. Export or save a copy first if you want to keep the current version.";

export function getChartTemplate(id: ChartTemplateId): ChartTemplateOption | undefined {
  return CHART_TEMPLATES.find((t) => t.id === id);
}
