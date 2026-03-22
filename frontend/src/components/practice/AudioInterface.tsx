import { Mic, Square, Volume2 } from "lucide-react";
import { RecordButtonProps } from "@/types";

export function RecordButton({ isRecording, onToggle, disabled, className }: RecordButtonProps) {
  return (
    <div className={`flex flex-col items-center gap-4 ${className || ''}`}>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          isRecording 
            ? 'bg-secondary text-white scale-110' 
            : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20 hover:shadow-primary/40'
        }`}
      >
        {isRecording ? (
          <Square className="w-8 h-8 fill-current" />
        ) : (
          <Mic className="w-8 h-8 font-black" />
        )}
        
        {isRecording && (
          <span className="absolute inset-0 rounded-full border-4 border-secondary animate-ping opacity-40 shadow-[0_0_50px_rgba(239,68,68,0.5)]" />
        )}
      </button>
    </div>
  );
}

export function AudioIndicator({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="absolute top-8 right-8 flex items-center gap-2">
      <div className={`p-4 rounded-2xl glass-morphism border border-white/20 shadow-2xl backdrop-blur-xl ${isPlaying ? 'text-primary bg-primary/10' : 'text-muted-foreground bg-white/5 opacity-40'}`}>
        <Volume2 className={`w-8 h-8 ${isPlaying ? 'animate-bounce' : ''}`} />
      </div>
    </div>
  );
}
