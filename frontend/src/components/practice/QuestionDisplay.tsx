import { QuestionDisplayProps } from "@/types";

export function QuestionDisplay({ question, index, total }: QuestionDisplayProps) {
  return (
    <div className="w-full max-w-2xl text-center mb-12">
      <div className="mb-4 flex items-center justify-center gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full">
          Question {index + 1} of {total}
        </span>
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight tracking-tight">
        {question}
      </h2>
    </div>
  );
}
