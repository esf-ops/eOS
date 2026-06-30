import React from "react";
import {
  WORKFLOW_STEPS,
  WORKFLOW_STEP_LABELS,
  type WorkflowStep,
} from "../lib/takeoffWorkflowUi";

interface Props {
  currentStep: WorkflowStep;
  isStepComplete: (step: WorkflowStep) => boolean;
  className?: string;
}

export default function TakeoffWorkflowStepper({ currentStep, isStepComplete, className = "" }: Props) {
  const currentIndex = WORKFLOW_STEPS.indexOf(currentStep);

  return (
    <nav
      className={`takeoff-wf-stepper${className ? ` ${className}` : ""}`}
      aria-label="Takeoff workflow"
    >
      <ol className="takeoff-wf-stepper-list">
        {WORKFLOW_STEPS.map((step, index) => {
          const complete = isStepComplete(step);
          const current = step === currentStep;
          const future = index > currentIndex && !complete;

          return (
            <li
              key={step}
              className={`takeoff-wf-stepper-item${
                complete ? " takeoff-wf-stepper-item--complete" : ""
              }${current ? " takeoff-wf-stepper-item--current" : ""}${
                future ? " takeoff-wf-stepper-item--future" : ""
              }`}
              aria-current={current ? "step" : undefined}
            >
              <span className="takeoff-wf-stepper-marker" aria-hidden>
                {complete ? "✓" : index + 1}
              </span>
              <span className="takeoff-wf-stepper-label">{WORKFLOW_STEP_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
