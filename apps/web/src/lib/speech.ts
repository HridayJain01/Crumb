import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Voice input via the free Web Speech API (Chrome, Edge, Safari). Progressive enhancement:
 * the mic button is hidden where unsupported. Indian English helps with "roti", "dal" etc.
 */

interface RecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const supported = typeof window !== 'undefined' && getCtor() !== null;
  const cb = useRef(onText);
  cb.current = onText;

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const r = new Ctor();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      cb.current((finalText + interim).trim(), interim === '');
    };
    r.onerror = (e) =>
      setError(
        e.error === 'not-allowed'
          ? 'Microphone permission was denied.'
          : 'Didn’t catch that — try again?',
      );
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}
