type Step = {
  id: number;
  label: string;
  done: boolean;
  active: boolean;
};

type WorkflowStepperProps = {
  steps: Step[];
};

export default function WorkflowStepper({ steps }: WorkflowStepperProps) {
  return (
    <ol className="workflow-stepper" aria-label="Workflow progress">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={`workflow-step${step.done ? " done" : ""}${step.active ? " active" : ""}`}
        >
          <span className="workflow-step-marker" aria-hidden="true">
            {step.done ? "✓" : step.id}
          </span>
          <span className="workflow-step-label">{step.label}</span>
          {index < steps.length - 1 ? <span className="workflow-step-connector" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
