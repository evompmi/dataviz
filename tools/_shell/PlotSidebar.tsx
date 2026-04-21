// Shared sidebar frame for every plot tool: a fixed-width column that hosts
// the ActionsPanel and all collapsible control tiles. Sticky by default so
// the controls follow the viewport while the plot scrolls; opt out with
// `sticky={false}` for tools whose sidebar is short enough that sticky
// scrolling would be distracting.

interface PlotSidebarProps {
  children: React.ReactNode;
  sticky?: boolean;
  width?: number;
}

export function PlotSidebar({ children, sticky = true, width = 279 }: PlotSidebarProps) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        ...(sticky
          ? {
              position: "sticky",
              top: 24,
              maxHeight: "calc(100vh - 90px)",
              overflowY: "auto",
            }
          : {}),
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}
