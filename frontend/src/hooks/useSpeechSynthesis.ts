"use client";

import { useSpeechSynthesis as useReactSpeechSynthesis } from 'react-speech-kit';
import { useCallback, useState, useEffect } from 'react';

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { speak, cancel, voices } = useReactSpeechSynthesis({
    onEnd: () => setIsSpeaking(false)
  });
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);

  // Filter and select a high-quality female English voice that handles punctuation well
  useEffect(() => {
    if (voices && voices.length > 0) {
      // Look for natural sounding female voices (Google, Microsoft, Siri, etc.)
      const goodVoices = voices.filter(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google US English') || v.name.includes('Zira') || v.name.includes('Catherine'))
      );
      
      if (goodVoices.length > 0) {
        setPreferredVoice(goodVoices[0]);
      } else {
        // Fallback to any English voice
        setPreferredVoice(voices.find(v => v.lang.startsWith('en')) || voices[0]);
      }
    }
  }, [voices]);

  const customSpeak = useCallback((text: string, onEnd?: () => void) => {
    setIsSpeaking(true);
    speak({ 
      text, 
      voice: preferredVoice || undefined,
      rate: 0.9, // Slightly slower for clearer punctuation pauses
      pitch: 1.1 // Slightly higher pitch for female characteristics if only standard voices available
    });
    
    // Note: react-speech-kit handles the onEnd via its own config, 
    // but if a specific onEnd callback is passed, we can wrap it logic-wise if needed,
    // though the caller typically just relies on isSpeaking state changes.
  }, [speak, preferredVoice]);

  const customCancel = useCallback(() => {
    cancel();
    setIsSpeaking(false);
  }, [cancel]);

  return { speak: customSpeak, cancel: customCancel, isSpeaking };
}
