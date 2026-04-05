import api from "./api";

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
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
const backendAudioCache = new Map<string, Blob>();
const backendAudioInFlight = new Map<string, Promise<Blob>>();
let audioPlaybackUnlocked = false;

const BACKEND_TTS_TIMEOUT_MS = 90000;
const BACKEND_CACHE_LIMIT = 40;
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

const normalizeVoiceGender = (value?: SpeechVoiceGender): "male" | "female" => {
  return value === "male" ? "male" : "female";
};

const cacheBackendAudio = (key: string, blob: Blob) => {
  if (backendAudioCache.has(key)) {
    backendAudioCache.delete(key);
  }
  backendAudioCache.set(key, blob);
  if (backendAudioCache.size > BACKEND_CACHE_LIMIT) {
    const oldestKey = backendAudioCache.keys().next().value;
    if (oldestKey) backendAudioCache.delete(oldestKey);
  }
};

const resetCurrentAudio = () => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
};

export const unlockSpeechPlayback = async () => {
  if (audioPlaybackUnlocked || typeof window === "undefined") {
    return;
  }

  try {
    const probe = new Audio(SILENT_WAV_DATA_URI);
    probe.muted = true;
    await probe.play();
    probe.pause();
    probe.currentTime = 0;
    audioPlaybackUnlocked = true;
  } catch {
    // Ignore unlock failures; speak() still has browser fallback.
  }
};

const fetchBackendSpeechAudio = async (
  text: string,
  voiceGender: "male" | "female",
  style: SpeakOptions["style"]
) => {
  const cacheKey = `${voiceGender}|${style || "default"}|${text}`;

  const cached = backendAudioCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inFlight = backendAudioInFlight.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const promise = (async () => {
    const response = await api.post(
      "/speech/synthesize",
      {
        text,
        voice_gender: voiceGender,
      },
      {
        responseType: "arraybuffer",
        timeout: BACKEND_TTS_TIMEOUT_MS,
      }
    );
    const blob = new Blob([response.data], { type: "audio/wav" });
    cacheBackendAudio(cacheKey, blob);
    return blob;
  })();

  backendAudioInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    backendAudioInFlight.delete(cacheKey);
  }
};

export const prefetchSpeech = (text: string, options?: SpeakOptions) => {
  const content = (text || "").trim();
  if (!content) return;
  const backendVoiceGender = normalizeVoiceGender(options?.voiceGender);
  void fetchBackendSpeechAudio(content, backendVoiceGender, options?.style).catch(() => {
    // Silent prefetch failure; speak() has runtime fallback.
  });
};

export const prepareSpeech = async (text: string, options?: SpeakOptions) => {
  const content = (text || "").trim();
  if (!content) return;
  const backendVoiceGender = normalizeVoiceGender(options?.voiceGender);
  await fetchBackendSpeechAudio(content, backendVoiceGender, options?.style);
};

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

  // Warm up authenticated speech endpoint if available.
  try {
    await api.get("/speech/health");
  } catch {
    // Keep silent: browser fallback still works.
  }

  // Fire-and-forget XTTS warmup and a tiny prefetch so first interview play starts faster.
  void api.post("/speech/warmup", {}, { timeout: 60000 }).catch(() => undefined);
  prefetchSpeech("Interview starts now.", { voiceGender: "female", style: "assistant" });
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

const shouldUseBrowserFallback = (options?: SpeakOptions) => options?.style !== "assistant";

const speakWithBrowserFallback = async (
  text: string,
  requestId: number,
  onEnd?: () => void,
  options?: SpeakOptions
) => {
  const voices = await waitForVoices();
  if (requestId !== speakRequestId) return;

  synthesisUtterance = new SpeechSynthesisUtterance(text);

  const voiceGender = options?.voiceGender || "auto";
  const preferredVoice = resolvePreferredVoice(voices, voiceGender);
  if (preferredVoice) {
    synthesisUtterance.voice = preferredVoice;
  }

  if (options?.style === "assistant") {
    synthesisUtterance.rate = 1.04;
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

export const speak = (text: string, onEnd?: () => void, options?: SpeakOptions) => {
  const content = (text || "").trim();
  if (!content) {
    if (onEnd) onEnd();
    return;
  }

  if (!isSpeechSynthesisSupported()) {
    console.warn("Speech synthesis is not supported in this browser.");
    if (onEnd) onEnd();
    return;
  }

  // Stop currently playing speech and create an id so stale async plays are ignored.
  stopSpeaking();
  const requestId = ++speakRequestId;
  const backendVoiceGender = normalizeVoiceGender(options?.voiceGender);

  void (async () => {
    try {
      const wavBlob = await fetchBackendSpeechAudio(content, backendVoiceGender, options?.style);

      if (requestId !== speakRequestId || !wavBlob) return;

      resetCurrentAudio();
      currentAudioUrl = URL.createObjectURL(wavBlob);
      currentAudio = new Audio(currentAudioUrl);
      currentAudio.preload = "auto";
      currentAudio.playbackRate = options?.style === "assistant" ? 1.12 : 1.08;

      const finish = () => {
        if (requestId !== speakRequestId) return;
        if (onEnd) onEnd();
      };

      currentAudio.onended = finish;
      currentAudio.onerror = () => {
        void (async () => {
          try {
            await unlockSpeechPlayback();
            if (requestId !== speakRequestId || !currentAudio) return;
            await currentAudio.play();
          } catch {
            if (shouldUseBrowserFallback(options)) {
              await speakWithBrowserFallback(content, requestId, onEnd, options);
              return;
            }
            if (onEnd) onEnd();
          }
        })();
      };

      try {
        await currentAudio.play();
      } catch {
        await unlockSpeechPlayback();
        await currentAudio.play();
      }
    } catch {
      // Network/model issue: fallback to browser speech to keep interview flow stable.
      if (shouldUseBrowserFallback(options)) {
        await speakWithBrowserFallback(content, requestId, onEnd, options);
      } else if (onEnd) {
        onEnd();
      }
    }
  })();
};

export const stopSpeaking = () => {
  speakRequestId += 1;
  resetCurrentAudio();
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
