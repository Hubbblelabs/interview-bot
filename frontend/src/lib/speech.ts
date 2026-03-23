export const isSpeechSynthesisSupported = () => {
  return typeof window !== "undefined" && "speechSynthesis" in window;
};

export type SpeechVoiceGender = "male" | "female" | "auto";

type SpeakOptions = {
  voiceGender?: SpeechVoiceGender;
  style?: "assistant" | "default";
};

export const isSpeechRecognitionSupported = () => {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
};

// Text-to-Speech
let synthesisUtterance: SpeechSynthesisUtterance | null = null;

const FEMALE_HINTS = ["female", "woman", "samantha", "zira", "aria", "jenny", "karen", "susan"];
const MALE_HINTS = ["male", "man", "david", "mark", "guy", "ryan", "adam", "george"];

const scoreVoice = (voice: SpeechSynthesisVoice, voiceGender: SpeechVoiceGender) => {
  const name = (voice.name || "").toLowerCase();
  const lang = (voice.lang || "").toLowerCase();
  let score = 0;

  if (lang.startsWith("en-us")) score += 40;
  else if (lang.startsWith("en")) score += 25;

  if (name.includes("google") || name.includes("microsoft") || name.includes("natural") || name.includes("neural")) {
    score += 20;
  }

  const hasFemale = FEMALE_HINTS.some((hint) => name.includes(hint));
  const hasMale = MALE_HINTS.some((hint) => name.includes(hint));

  if (voiceGender === "female") {
    if (hasFemale) score += 25;
    if (hasMale) score -= 15;
  }

  if (voiceGender === "male") {
    if (hasMale) score += 25;
    if (hasFemale) score -= 15;
  }

  if (voice.default) score += 5;
  return score;
};

const pickBestVoice = (voices: SpeechSynthesisVoice[], voiceGender: SpeechVoiceGender) => {
  if (!voices.length) return null;
  return [...voices].sort((a, b) => scoreVoice(b, voiceGender) - scoreVoice(a, voiceGender))[0] || null;
};

export const speak = (text: string, onEnd?: () => void, options?: SpeakOptions) => {
  if (!isSpeechSynthesisSupported()) {
    console.warn("Speech synthesis is not supported in this browser.");
    if (onEnd) onEnd();
    return;
  }

  // Stop any currently playing speech
  stopSpeaking();

  synthesisUtterance = new SpeechSynthesisUtterance(text);

  const voiceGender = options?.voiceGender || "auto";

  // Pick a higher quality English voice with optional gender preference.
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = pickBestVoice(voices, voiceGender);
  if (preferredVoice) {
    synthesisUtterance.voice = preferredVoice;
  }

  if (options?.style === "assistant") {
    synthesisUtterance.rate = 0.94;
    synthesisUtterance.pitch = voiceGender === "male" ? 0.9 : 1.0;
    synthesisUtterance.volume = 1.0;
  } else {
    synthesisUtterance.rate = 1.0;
    synthesisUtterance.pitch = 1.0;
    synthesisUtterance.volume = 1.0;
  }

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
