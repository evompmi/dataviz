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

interface PlotToolShellProps<TVis extends object> {
  state: PlotToolState<TVis>;
  toolName: string;
  title: string;
  subtitle: string;
  visInit: TVis;
  steps: string[];
  canNavigate: (target: string) => boolean;
  children: React.ReactNode;
}

export function PlotToolShell<TVis extends object>({
  state,
  toolName,
  title,
  subtitle,
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
        subtitle={subtitle}
        right={
          <PrefsPanel tool={toolName} vis={state.vis} visInit={visInit} updVis={state.updVis} />
        }
      />
      <StepNavBar
        steps={steps}
        currentStep={state.step}
        onStepChange={state.setStep}
        canNavigate={canNavigate}
      />
      <CommaFixBanner commaFixed={state.commaFixed} commaFixCount={state.commaFixCount} />
      <ParseErrorBanner error={state.parseError} />
      {children}
    </div>
  );
}
