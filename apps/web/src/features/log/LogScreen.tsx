import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Camera, Mic, MicOff, Search, Sparkles } from 'lucide-react';
import { buildManualItem, quickAdds, type WorkoutType } from '@crumb/core';
import { useProfile } from '../../data/user';
import { useMemory, useTemplates } from '../../data/memory';
import { Button, IconButton } from '../../components/ui/Button';
import { Card, SectionTitle } from '../../components/ui/Card';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { useToast } from '../../components/ui/Toast';
import { preparePhoto } from '../../lib/image';
import { useSpeech } from '../../lib/speech';
import { hourNow, todayKey } from '../../lib/time';
import { ConfirmSheet } from './ConfirmSheet';
import { FoodSearch } from './FoodSearch';
import { useLogFlow } from './useLogFlow';
import { StepsSheet, WorkoutSheet, WORKOUT_CHOICES } from '../activity/ActivitySheets';

const EXAMPLES = [
  'two rotis, aloo sabzi and a bowl of dal',
  'a glass of milk and two bananas',
  'poha with tea, around 9am',
  'chicken biryani, half plate',
  'my usual protein shake',
];

export function LogScreen() {
  const { uid, profile } = useProfile();
  const memory = useMemory(uid);
  const { templates } = useTemplates(uid);
  const flow = useLogFlow({ uid, profile, memory: memory.map, memoryList: memory.list, templates });
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [workout, setWorkout] = useState<WorkoutType | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const today = todayKey(profile.timezone);
  const placeholder = EXAMPLES[new Date().getMinutes() % EXAMPLES.length];

  const [viaVoice, setViaVoice] = useState(false);
  const speech = useSpeech((t) => {
    setText(t);
    setViaVoice(true);
  });
  const suggestions = quickAdds(memory.list, templates, hourNow(profile.timezone));
  const photoMode = params.get('mode') === 'photo';

  useEffect(() => {
    if (params.get('mode') === 'text') textRef.current?.focus();
  }, [params]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const photo = await preparePhoto(file);
      await flow.analyze({ photo, text: text.trim() || undefined, inputType: 'photo' });
      setText('');
    } catch {
      toast({
        message: 'Couldn’t read that photo. Try another, or describe the meal.',
        tone: 'warning',
      });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      if (photoMode) setParams({}, { replace: true });
    }
  }

  async function onAnalyze() {
    const t = text.trim();
    if (!t) return;
    speech.stop();
    await flow.analyze({ text: t, inputType: viaVoice ? 'voice' : 'text' });
    setText('');
    setViaVoice(false);
  }

  return (
    <div className="pb-6">
      <h1 className="pt-2 text-[28px] font-black tracking-tight">What did you eat?</h1>
      <p className="mb-4 text-[15px] font-semibold text-muted">
        Snap it, say it or type it — I’ll do the counting.
      </p>

      <Card className={photoMode ? 'ring-4 ring-primary-soft' : ''}>
        <label htmlFor="meal-text" className="sr-only">
          Describe your meal
        </label>
        <textarea
          id="meal-text"
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onAnalyze();
            }
          }}
          rows={3}
          maxLength={1000}
          placeholder={`e.g. ${placeholder}`}
          className="w-full resize-none bg-transparent text-[18px] font-bold leading-snug outline-none placeholder:text-muted"
        />
        {speech.error && <p className="mb-2 text-[13px] font-bold text-danger">{speech.error}</p>}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
          <Button
            variant={photoMode ? 'primary' : 'soft'}
            icon={<Camera className="size-5" />}
            loading={photoBusy}
            onClick={() => fileRef.current?.click()}
          >
            Photo
          </Button>
          {speech.supported && (
            <IconButton
              label={speech.listening ? 'Stop listening' : 'Speak your meal'}
              onClick={speech.listening ? speech.stop : speech.start}
              className={
                speech.listening
                  ? 'bg-primary text-white animate-pulse hover:bg-primary'
                  : 'bg-surface-2'
              }
            >
              {speech.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </IconButton>
          )}
          <Button
            className="ml-auto"
            icon={<Sparkles className="size-5" />}
            disabled={!text.trim() || flow.sheet.status === 'analyzing'}
            onClick={() => void onAnalyze()}
          >
            Analyze
          </Button>
        </div>
      </Card>

      {suggestions.length > 0 && (
        <>
          <SectionTitle>One tap</SectionTitle>
          <ChipRow>
            {suggestions.map((s) => (
              <button
                key={`${s.kind}:${s.id}`}
                type="button"
                onClick={() => void flow.quickAdd(s.kind, s.id)}
                className="flex shrink-0 items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-left shadow-card transition active:scale-[0.97]"
              >
                <span className="text-2xl" aria-hidden>
                  {s.emoji}
                </span>
                <span>
                  <span className="block max-w-40 truncate text-[14px] font-extrabold">
                    {s.label}
                  </span>
                  <span className="block text-[12px] font-semibold text-muted">{s.subtitle}</span>
                </span>
              </button>
            ))}
          </ChipRow>
        </>
      )}

      <SectionTitle
        action={
          !searching && (
            <button
              className="text-[13px] font-extrabold text-primary-ink"
              onClick={() => setSearching(true)}
            >
              <Search className="mr-1 inline size-4" aria-hidden />
              Search foods
            </button>
          )
        }
      >
        Pick from the list
      </SectionTitle>
      {searching ? (
        <FoodSearch
          autoFocus
          diet={profile.diet}
          onPick={(food) => {
            setSearching(false);
            flow.startManual([buildManualItem(food, { memory: memory.map.get(food.id) })]);
          }}
        />
      ) : (
        <p className="px-1 text-[14px] font-semibold text-muted">
          Prefer to pick exactly? Search Crumb’s food list — it works offline too.
        </p>
      )}

      <SectionTitle>Moved today?</SectionTitle>
      <ChipRow>
        <Chip onClick={() => setStepsOpen(true)}>
          <span aria-hidden>👟</span> Steps
        </Chip>
        {WORKOUT_CHOICES.slice(0, 6).map((c) => (
          <Chip key={c.type} onClick={() => setWorkout(c.type)}>
            <span aria-hidden>{c.emoji}</span> {c.label}
          </Chip>
        ))}
      </ChipRow>

      <ConfirmSheet
        state={flow.sheet}
        diet={profile.diet}
        onConfirm={flow.confirm}
        onClose={flow.close}
        onDescribeInstead={() => {
          flow.close();
          setTimeout(() => textRef.current?.focus(), 250);
        }}
      />
      <WorkoutSheet
        open={workout !== null}
        onClose={() => setWorkout(null)}
        uid={uid}
        date={today}
        profile={profile}
        initialType={workout ?? 'walk'}
      />
      <StepsSheet
        open={stepsOpen}
        onClose={() => setStepsOpen(false)}
        uid={uid}
        date={today}
        profile={profile}
        current={0}
      />
    </div>
  );
}
