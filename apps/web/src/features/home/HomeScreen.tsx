import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Camera, ChevronLeft, ChevronRight, Flame, Keyboard } from 'lucide-react';
import {
  addDays,
  DISCLAIMER,
  generateRecommendations,
  loggingStreak,
  mean,
  templateInsight,
  type InsightContext,
} from '@crumb/core';
import { useProfile, useUser } from '../../data/user';
import { useDay, useDays } from '../../data/day';
import { useMemory } from '../../data/memory';
import { SectionTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/States';
import { Pill } from '../../components/ui/Badge';
import { dayTitle, greeting, hourNow, todayKey } from '../../lib/time';
import { NutritionCard } from './NutritionCard';
import { ActivityCard } from './ActivityCard';
import { EnergyCard } from './EnergyCard';
import { NextStepCard } from './NextStepCard';
import { MealTimeline } from './MealTimeline';
import { useInsight } from './useInsight';

export function HomeScreen() {
  const { uid, profile, targets } = useProfile();
  const { sampleData } = useUser();
  const navigate = useNavigate();
  const today = todayKey(profile.timezone);
  const [date, setDate] = useState(today);
  const isToday = date === today;
  const hour = isToday ? hourNow(profile.timezone) : 21;

  const day = useDay(uid, date, profile);
  const recent = useDays(uid, addDays(today, -13), addDays(today, -1));
  const memory = useMemory(uid);

  const streak = useMemo(
    () => loggingStreak([...recent.data, day.summary], today),
    [recent.data, day.summary, today],
  );

  const recContext = useMemo(() => {
    const logged = recent.data.filter((d) => d.mealsLogged > 0);
    const week = logged.filter((d) => d.date >= addDays(today, -7));
    const strengthDay = [...recent.data].reverse().find((d) => d.strengthSessions > 0);
    return {
      hour,
      goal: profile.goal,
      diet: profile.diet,
      allergies: profile.allergies,
      targets,
      today: {
        kcal: day.summary.intake.kcal,
        proteinG: day.summary.intake.proteinG,
        steps: day.summary.steps,
        mealsLogged: day.summary.mealsLogged,
        strengthSessions: day.summary.strengthSessions,
      },
      recent: {
        daysLogged: logged.length,
        avgSteps: mean(week.filter((d) => d.steps > 0).map((d) => d.steps)),
        daysSinceStrength: strengthDay
          ? Math.round((Date.parse(today) - Date.parse(strengthDay.date)) / 86_400_000)
          : undefined,
        lastDaysKcal: recent.data
          .filter((d) => d.date >= addDays(today, -3))
          .map((d) => d.intake.kcal),
      },
    };
  }, [hour, profile, targets, day.summary, recent.data, today]);

  const recommendations = useMemo(() => generateRecommendations(recContext), [recContext]);
  const fallback = useMemo(
    () => ({ ...templateInsight(recContext, recommendations[0]), source: 'template' as const }),
    [recContext, recommendations],
  );

  const insightContext = useMemo<InsightContext>(
    () => ({
      goal: profile.goal,
      diet: profile.diet,
      localHour: hour,
      today: {
        // Rounded so the wording never implies false precision (PRD §5.2).
        kcal: Math.round(day.summary.intake.kcal / 50) * 50,
        kcalTarget: targets.kcal,
        proteinG: Math.round(day.summary.intake.proteinG / 5) * 5,
        proteinTarget: targets.proteinG,
        steps: day.summary.steps,
        mealsLogged: day.summary.mealsLogged,
        balanceLabel: day.summary.balance.label,
      },
      recent: { daysLogged: recContext.recent.daysLogged, avgSteps: recContext.recent.avgSteps },
      commonFoods: memory.list.slice(0, 8).map((m) => m.label.slice(0, 40)),
      chosenAction: {
        kind: recommendations[0]?.kind ?? 'on_track',
        text: recommendations[0]
          ? recommendations[0].text.slice(0, 200)
          : 'Keep logging as you go.',
      },
    }),
    [profile, hour, day.summary, targets, recContext.recent, memory.list, recommendations],
  );
  const insight = useInsight(uid, date, insightContext, fallback);

  const name = profile.name ? `, ${profile.name}` : '';
  const empty = !day.loading && day.entries.length === 0;

  return (
    <div className="space-y-3 pb-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <p className="text-[14px] font-bold text-muted">
            {isToday ? `${greeting(hour)}${name} 👋` : 'Looking back'}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDate((d) => addDays(d, -1))}
              className="-ml-2 flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <ChevronLeft className="size-5" />
            </button>
            <h1 className="text-[26px] font-black tracking-tight">{dayTitle(date, today)}</h1>
            {!isToday && (
              <button
                type="button"
                aria-label="Next day"
                onClick={() => setDate((d) => (d < today ? addDays(d, 1) : d))}
                className="flex size-9 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </div>
        </div>
        {sampleData && (
          <Pill className="mt-2" title="Generated for a demo, not real health data">
            Sample history
          </Pill>
        )}
        {!sampleData && streak > 1 && (
          <Pill tone="primary" className="mt-2">
            <Flame className="size-3.5" aria-hidden /> {streak}-day streak
          </Pill>
        )}
      </header>

      <NutritionCard summary={day.summary} targets={targets} isToday={isToday} />
      {isToday && (
        <NextStepCard
          uid={uid}
          date={date}
          timezone={profile.timezone}
          insight={insight.insight}
          loading={insight.loading}
          recommendations={recommendations}
          memory={memory.map}
        />
      )}
      <ActivityCard
        uid={uid}
        date={date}
        profile={profile}
        summary={day.summary}
        activities={day.activities}
      />
      <EnergyCard summary={day.summary} inProgress={isToday && hour < 20} />

      <SectionTitle
        action={
          isToday && (
            <Link to="/log" className="text-[13px] font-extrabold text-primary-ink">
              + Add meal
            </Link>
          )
        }
      >
        Meals
      </SectionTitle>
      {empty ? (
        <div className="rounded-card bg-surface shadow-card">
          <EmptyState
            title={isToday ? 'Nothing logged yet' : 'Nothing logged this day'}
            body={isToday ? 'Snap a photo or type one sentence — it takes seconds.' : undefined}
            action={
              isToday && (
                <div className="flex gap-2">
                  <Button
                    icon={<Camera className="size-5" />}
                    onClick={() => navigate('/log?mode=photo')}
                  >
                    Snap a meal
                  </Button>
                  <Button
                    variant="soft"
                    icon={<Keyboard className="size-5" />}
                    onClick={() => navigate('/log?mode=text')}
                  >
                    Type it
                  </Button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <MealTimeline uid={uid} entries={day.entries} diet={profile.diet} />
      )}
      <p className="px-2 pt-4 text-center text-[11px] font-semibold text-muted">{DISCLAIMER}</p>
    </div>
  );
}
