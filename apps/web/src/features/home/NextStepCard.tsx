import { useNavigate } from 'react-router';
import { Dumbbell, Footprints, Sparkles } from 'lucide-react';
import {
  buildManualItem,
  mealTypeForHour,
  type FoodMemory,
  type InsightResponse,
  type Recommendation,
  type Unit,
} from '@crumb/core';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { deleteEntry, saveMeals } from '../../data/mutations';
import { loadFoodDb } from '../../lib/foods';
import { hourNow } from '../../lib/time';

/** One insight + one or two actions (PRD §17, §31). Protein ideas log with one tap. */
export function NextStepCard({
  uid,
  date,
  timezone,
  insight,
  loading,
  recommendations,
  memory,
}: {
  uid: string;
  date: string;
  timezone: string;
  insight: InsightResponse;
  loading: boolean;
  recommendations: Recommendation[];
  memory: ReadonlyMap<string, FoodMemory>;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [top, second] = recommendations;

  async function logIdea(foodId: string, quantity: number, unit: Unit) {
    const db = await loadFoodDb();
    const food = db.byId.get(foodId);
    if (!food) return;
    const saved = saveMeals({
      uid,
      date,
      drafts: [
        {
          mealType: mealTypeForHour(hourNow(timezone)),
          items: [buildManualItem(food, { quantity, unit })],
        },
      ],
      originalItems: [],
      inputType: 'quick',
      memory,
    });
    toast({
      message: `Added ${food.name}`,
      action: { label: 'Undo', onClick: () => saved.forEach((s) => deleteEntry(uid, s.id)) },
    });
  }

  return (
    <Card tone="warm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-muted">
            Today’s nudge
          </h2>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-4/5" />
          ) : (
            <p className="mt-0.5 text-[16px] font-extrabold leading-snug">{insight.insight}</p>
          )}
        </div>
      </div>

      {top && (
        <div className="mt-3 rounded-2xl bg-surface p-3">
          <p className="text-[15px] font-extrabold">{top.title}</p>
          <p className="text-[14px] font-semibold text-muted">
            {insight.source === 'ai' ? insight.action : top.text}
          </p>
          {top.proteinIdeas && top.proteinIdeas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {top.proteinIdeas.map((idea) => (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => void logIdea(idea.foodId, idea.quantity, idea.unit)}
                  className="flex items-center gap-1.5 rounded-chip border border-line bg-bg px-3 py-1.5 text-[13px] font-extrabold transition hover:border-teal active:scale-[0.97]"
                  title={`Log ${idea.portion} (~${idea.proteinG} g protein)`}
                >
                  <span aria-hidden>{idea.emoji}</span>
                  {idea.label}
                  <span className="text-teal">+{idea.proteinG} g</span>
                </button>
              ))}
            </div>
          )}
          {(top.kind === 'walk_more' || top.kind === 'gentle_walk') && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              icon={<Footprints className="size-4" />}
              onClick={() => navigate(`/insights?walk=${top.walkMinutes ?? 20}`)}
            >
              Plan a {top.walkMinutes ?? 20}-min walk near me
            </Button>
          )}
          {top.workout && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              icon={<Dumbbell className="size-4" />}
              onClick={() => navigate(`/insights?workout=${top.workout!.id}`)}
            >
              Open {top.workout.title}
            </Button>
          )}
          {top.kind === 'log_first_meal' && (
            <Button size="sm" className="mt-2" onClick={() => navigate('/log')}>
              Log a meal
            </Button>
          )}
        </div>
      )}
      {second && (
        <button
          type="button"
          onClick={() =>
            second.kind === 'walk_more' || second.kind === 'gentle_walk'
              ? navigate(`/insights?walk=${second.walkMinutes ?? 20}`)
              : second.workout
                ? navigate(`/insights?workout=${second.workout.id}`)
                : undefined
          }
          className="mt-2 w-full rounded-2xl px-3 py-2 text-left text-[14px] font-bold text-muted hover:bg-surface"
        >
          Also: <span className="text-ink">{second.title}</span>
        </button>
      )}
    </Card>
  );
}
