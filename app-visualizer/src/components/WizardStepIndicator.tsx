import { WIZARD_STEPS, type WizardStepLabel } from "../lib/config";

type WizardStepIndicatorProps = {
  currentStep: 1 | 2 | 3;
};

const STEP_LABELS: WizardStepLabel[] = [...WIZARD_STEPS];

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <nav className="viz-steps" aria-label="Progress">
      {STEP_LABELS.map((label, index) => {
        const stepNum = (index + 1) as 1 | 2 | 3;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div
            key={label}
            className={`viz-step${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}`}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="viz-step-badge">
              {isComplete ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 12.5 10 17l9-10"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                stepNum
              )}
            </span>
            <span className="viz-step-label">{label}</span>
            {index < STEP_LABELS.length - 1 ? <span className="viz-step-line" aria-hidden /> : null}
          </div>
        );
      })}
    </nav>
  );
}
