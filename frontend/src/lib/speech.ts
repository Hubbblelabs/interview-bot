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
let speakRequestId = 0;
const preferredVoiceUriByGender: Partial<Record<SpeechVoiceGender, string>> = {};

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

const waitForVoices = (timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> => {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve([]);
      return;
    }

    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      resolve(existing);
      return;
    }

    // Trigger browser to load voice list.
    window.speechSynthesis.getVoices();

    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(voices);
    };

    const onVoicesChanged = () => {
      finish(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => finish(window.speechSynthesis.getVoices()), timeoutMs);
  });
};

export const warmupSpeechVoices = async () => {
  await waitForVoices();
};

const resolvePreferredVoice = (voices: SpeechSynthesisVoice[], voiceGender: SpeechVoiceGender) => {
  const cachedUri = preferredVoiceUriByGender[voiceGender];
  if (cachedUri) {
    const cached = voices.find((v) => v.voiceURI === cachedUri);
    if (cached) return cached;
  }

  const picked = pickBestVoice(voices, voiceGender);
  if (picked) {
    preferredVoiceUriByGender[voiceGender] = picked.voiceURI;
  }
  return picked;
};

export const speak = (text: string, onEnd?: () => void, options?: SpeakOptions) => {
  if (!isSpeechSynthesisSupported()) {
    console.warn("Speech synthesis is not supported in this browser.");
    if (onEnd) onEnd();
    return;
  }

  // Stop any currently playing speech and create an id so stale async plays are ignored.
  stopSpeaking();
  const requestId = ++speakRequestId;

  const voiceGender = options?.voiceGender || "auto";

  void (async () => {
    const voices = await waitForVoices();
    if (requestId !== speakRequestId) return;

    synthesisUtterance = new SpeechSynthesisUtterance(text);

    const preferredVoice = resolvePreferredVoice(voices, voiceGender);
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
  })();
};

export const stopSpeaking = () => {
  speakRequestId += 1;
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
