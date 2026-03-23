declare module 'react-speech-kit' {
  export function useSpeechSynthesis(options?: { onEnd?: () => void }): {
    speak: (args: { text: string; voice?: SpeechSynthesisVoice; rate?: number; pitch?: number }) => void;
    cancel: () => void;
    speaking: boolean;
    supported: boolean;
    voices: SpeechSynthesisVoice[];
  };
}
