import { HeatmapProps } from "@/types";

export function Heatmap({ total, answeredCount }: HeatmapProps) {
  // Mocking "correctness" for the heatmap UI
  const mockCorrectness = Array.from({ length: total }, (_, i) => {
    if (i >= answeredCount) return "empty";
    const rand = Math.random();
    if (rand > 0.4) return "correct";
    if (rand > 0.1) return "neutral";
    return "incorrect";
  });

  return (
    <div className="w-full">
      <h3 className="text-lg font-bold text-foreground mb-4">Performance Heatmap</h3>
      <div className="flex flex-wrap gap-3">
        {mockCorrectness.map((status, i) => (
          <div
            key={i}
            className={`w-10 h-10 rounded-xl border-2 transition-all cursor-help hover:scale-110 ${
              status === "correct" 
                ? "bg-primary border-primary shadow-[0_0_15px_rgba(23,77,56,0.3)]" 
                : status === "neutral" 
                ? "bg-bg-muted border-bg-muted" 
                : status === "incorrect"
                ? "bg-secondary border-secondary shadow-[0_0_15px_rgba(77,23,23,0.3)]"
                : "bg-transparent border-border border-dashed"
            }`}
            title={`Question ${i + 1}: ${status.toUpperCase()}`}
          />
        ))}
      </div>
      <div className="mt-6 flex items-center gap-6 text-xs font-semibold text-muted uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" /> Excellent
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-bg-muted" /> Good
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-secondary" /> Needs Work
        </div>
      </div>
    </div>
  );
}
