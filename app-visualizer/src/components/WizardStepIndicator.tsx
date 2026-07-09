import { WIZARD_STEPS, type WizardStepLabel } from "../lib/config";

type WizardStepIndicatorProps = {
  currentStep: 1 | 2 | 3;
};

const STEP_LABELS: WizardStepLabel[] = [...WIZARD_STEPS];

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <nav className="wizard-steps" aria-label="Progress">
      {STEP_LABELS.map((label, index) => {
        const stepNum = (index + 1) as 1 | 2 | 3;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div
            key={label}
            className={`wizard-step${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}`}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="wizard-step-badge">{isComplete ? "✓" : stepNum}</span>
            <span className="wizard-step-label">{label}</span>
          </div>
        );
      })}
    </nav>
  );
}
