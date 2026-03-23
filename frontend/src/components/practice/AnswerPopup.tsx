import { Check, RefreshCcw } from "lucide-react";
import { AnswerPopupProps } from "@/types";

export function AnswerPopup({ isOpen, transcript, onConfirm, onRetry }: AnswerPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center border border-slate-100 animate-in fade-in zoom-in duration-200">
        <h3 className="text-xl font-semibold mb-4 text-slate-800">You said:</h3>
        
        <div className="w-full min-h-30 p-6 bg-slate-50 rounded-xl mb-8 flex items-center justify-center">
          <p className="text-lg text-slate-600">
            {transcript || "No speech detected. Please try again."}
          </p>
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCcw className="w-5 h-5" />
            Retry
          </button>
          <button
            onClick={onConfirm}
            disabled={!transcript}
            className="flex-1 py-3 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Check className="w-5 h-5" />
            Next Question
          </button>
        </div>
      </div>
    </div>
  );
}
