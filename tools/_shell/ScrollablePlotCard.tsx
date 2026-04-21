// Plot card that adds horizontal-scroll affordances when its SVG content is
// wider than the viewport: a left fade when scrolled away from the start,
// a right fade when more content remains, and a transient "Scroll for more"
// pill that hides once the user has scrolled. Every affordance is driven by
// a ResizeObserver on the scroll container + its first child so the
// overlays stay accurate across window resizes and SVG re-renders.
//
// Lifted verbatim from tools/upset.tsx; copies in venn.tsx and heatmap.tsx
// will migrate here too in follow-up phase-B passes.

const { useState, useRef, useEffect, useCallback } = React;

interface ScrollablePlotCardProps {
  children: React.ReactNode;
}

export function ScrollablePlotCard({ children }: ScrollablePlotCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflows = el.scrollWidth > el.clientWidth + 1;
    setHasOverflow(overflows);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const content = el.firstElementChild;
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [measure]);

  const onScroll = () => {
    measure();
    if (!userScrolled) setUserScrolled(true);
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="dv-panel dv-plot-card"
        style={{
          padding: 20,
          background: "var(--plot-card-bg)",
          borderColor: "var(--plot-card-border)",
          overflowX: "auto",
          maxWidth: "100%",
        }}
      >
        {children}
      </div>
      {hasOverflow && !atStart && (
        <div
          aria-hidden="true"
          className="dv-scroll-fade"
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            left: 1,
            width: 28,
            pointerEvents: "none",
            background: "linear-gradient(to right, var(--plot-card-bg), rgba(255,255,255,0))",
            borderTopLeftRadius: 8,
            borderBottomLeftRadius: 8,
          }}
        />
      )}
      {hasOverflow && !atEnd && (
        <div
          aria-hidden="true"
          className="dv-scroll-fade"
          style={{
            position: "absolute",
            top: 1,
            bottom: 1,
            right: 1,
            width: 28,
            pointerEvents: "none",
            background: "linear-gradient(to left, var(--plot-card-bg), rgba(255,255,255,0))",
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
          }}
        />
      )}
      {hasOverflow && !userScrolled && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 12,
            bottom: 10,
            padding: "4px 10px",
            borderRadius: 12,
            background: "var(--accent-primary)",
            color: "var(--on-accent)",
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            opacity: 0.92,
          }}
        >
          Scroll for more →
        </div>
      )}
    </div>
  );
}
