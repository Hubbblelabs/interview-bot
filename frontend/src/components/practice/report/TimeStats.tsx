import { Clock, TrendingUp } from "lucide-react";
import { TimeStatsProps } from "@/types";

export function TimeStats({ answers }: TimeStatsProps) {
  const totalTime = answers.reduce((acc, curr) => acc + curr.time, 0);
  const avgTime = answers.length > 0 ? totalTime / answers.length : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
      <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg">
          <Clock className="w-8 h-8" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted uppercase tracking-wider">Total Time</p>
          <p className="text-3xl font-bold text-foreground">{Math.floor(totalTime / 60)}m {totalTime % 60}s</p>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-secondary/5 border border-secondary/10 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-white shadow-lg">
          <TrendingUp className="w-8 h-8" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted uppercase tracking-wider">Avg. Response</p>
          <p className="text-3xl font-bold text-foreground">{avgTime.toFixed(1)}s</p>
        </div>
      </div>
    </div>
  );
}
