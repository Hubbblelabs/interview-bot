export const isSpeechSynthesisSupported = () => {
  return typeof window !== "undefined" && "speechSynthesis" in window;
};

export const isSpeechRecognitionSupported = () => {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
};

// Text-to-Speech
let synthesisUtterance: SpeechSynthesisUtterance | null = null;

export const speak = (text: string, onEnd?: () => void) => {
  if (!isSpeechSynthesisSupported()) {
    console.warn("Speech synthesis is not supported in this browser.");
    if (onEnd) onEnd();
    return;
  }

  // Stop any currently playing speech
  stopSpeaking();

  synthesisUtterance = new SpeechSynthesisUtterance(text);
  
  // Try to use a better sounding English voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(
    (v) => v.lang.includes("en-US") && (v.name.includes("Google") || v.name.includes("Samantha"))
  );
  if (preferredVoice) {
    synthesisUtterance.voice = preferredVoice;
  }

  synthesisUtterance.rate = 1.0;
  synthesisUtterance.pitch = 1.0;

  if (onEnd) {
    synthesisUtterance.onend = onEnd;
    synthesisUtterance.onerror = onEnd;
  }

  window.speechSynthesis.speak(synthesisUtterance);
};

export const stopSpeaking = () => {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
    synthesisUtterance = null;
  }
};

// Speech-to-Text
export const createSpeechRecognition = (
  onResult: (text: string, finalText: string) => void,
  onEnd: () => void,
  onError: (error: string) => void
) => {
  if (!isSpeechRecognitionSupported()) {
    onError("Speech recognition is not supported in this browser.");
    return null;
  }

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let finalTranscript = "";

  recognition.onresult = (event: any) => {
    let interimTranscript = "";
    
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    
    // Pass both final+interim for live UI and final-only for downstream validation.
    onResult((finalTranscript + " " + interimTranscript).trim(), finalTranscript.trim());
  };

  recognition.onerror = (event: any) => {
    onError(event.error);
  };

  recognition.onend = () => {
    onEnd();
  };

  return recognition;
};
