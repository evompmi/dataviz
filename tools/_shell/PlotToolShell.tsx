// Outer page frame shared by every plot tool. Renders PageHeader (with the
// PrefsPanel in the top-right slot), the StepNavBar, the comma-fix banner,
// the parse-error banner, and delegates everything else to children — each
// tool still owns the per-step content (UploadStep, ConfigureStep, plot
// layout, etc.) since those differ per tool.
//
// Ambient names consumed (from tools/shared.bundle.js globals):
//   - PageHeader, StepNavBar, CommaFixBanner, ParseErrorBanner  (shared-ui.js)
//   - PrefsPanel  (shared-prefs.js)

import type { PlotToolState } from "./usePlotToolState";

const { useEffect, useRef, useState } = React;

interface PlotToolShellProps<TVis extends object> {
  state: PlotToolState<TVis>;
  toolName: string;
  title: string;
  visInit: TVis;
  steps: string[];
  canNavigate: (target: string) => boolean;
  children: React.ReactNode;
}

// 120 ms opacity fade on step change. Tracks the current step in a ref so the
// first mount doesn't fade in, and respects prefers-reduced-motion (no fade).
function StepFade({ step, children }: { step: string; children: React.ReactNode }) {
  const [opacity, setOpacity] = useState(1);
  const prevStep = useRef(step);
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (prevStep.current === step || reduceMotion) {
      prevStep.current = step;
      return;
    }
    prevStep.current = step;
    setOpacity(0);
    const id = window.setTimeout(() => setOpacity(1), 10);
    return () => window.clearTimeout(id);
  }, [step, reduceMotion]);
  return (
    <div style={{ opacity, transition: reduceMotion ? "none" : "opacity 120ms ease-out" }}>
      {children}
    </div>
  );
}

export function PlotToolShell<TVis extends object>({
  state,
  toolName,
  title,
  visInit,
  steps,
  canNavigate,
  children,
}: PlotToolShellProps<TVis>) {
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1400 }}>
      <PageHeader
        toolName={toolName}
        title={title}
        middle={
          <StepNavBar
            steps={steps}
            currentStep={state.step}
            onStepChange={state.setStep}
            canNavigate={canNavigate}
          />
        }
        right={
          state.step === "plot" ? (
            <PrefsPanel tool={toolName} vis={state.vis} visInit={visInit} updVis={state.updVis} />
          ) : null
        }
      />
      <CommaFixBanner commaFixed={state.commaFixed} commaFixCount={state.commaFixCount} />
      <ParseErrorBanner error={state.parseError} />
      <StepFade step={state.step}>{children}</StepFade>
    </div>
  );
}
