import { describe, expect, it } from "vitest";
import remnantCases from "../evals/remnant-pitch-cases.json";
import machineCases from "../evals/machine-troubleshooter-cases.json";
import quoteCases from "../evals/quote-scope-cases.json";
import careCases from "../evals/stone-care-cases.json";
import { requireToolById } from "../src/lib/ai-tools/registry";
import { buildMockContent } from "../src/lib/ai/mock";

type EvalCase = {
  id: string;
  input: Record<string, unknown>;
  expect: {
    sections?: string[];
    mustMatch?: string[];
    mustNotMatch?: string[];
  };
};

function runSuite(toolId: string, cases: EvalCase[]) {
  describe(`eval:${toolId}`, () => {
    for (const c of cases) {
      it(c.id, () => {
        const tool = requireToolById(toolId);
        const parsed = tool.formSchema.safeParse(c.input);
        expect(parsed.success).toBe(true);
        if (!parsed.success) return;
        const content = buildMockContent(tool, parsed.data);
        for (const section of c.expect.sections ?? []) {
          expect(content).toContain(section);
        }
        for (const pat of c.expect.mustMatch ?? []) {
          expect(content).toMatch(new RegExp(pat, "i"));
        }
        for (const pat of c.expect.mustNotMatch ?? []) {
          expect(content).not.toMatch(new RegExp(pat, "i"));
        }
      });
    }
  });
}

runSuite("remnant-pitch", remnantCases as EvalCase[]);
runSuite("machine-troubleshooter", machineCases as EvalCase[]);
runSuite("quote-scope", quoteCases as EvalCase[]);
runSuite("stone-care", careCases as EvalCase[]);
