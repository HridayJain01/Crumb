import {
  WALK_DISCLAIMER,
  loopWaypoints,
  mapsWalkingUrl,
  metFor,
  PACE,
  walkPlan,
  type RouteOption,
  type WalkRoutesRequest,
  type WalkRoutesResponse,
} from '@crumb/core';
import type { Deps } from './deps';
import type { MeasuredRoute } from './providers/routes';

/*
 * Walk planner (PRD §27–28): size a loop for the requested extra kcal or minutes,
 * measure it on real streets (Routes API) and rescale once if it is >15% off.
 * Location is used only inside this request — never stored or logged.
 */

const TOLERANCE = 0.15;

export async function planWalkRoutes(
  req: WalkRoutesRequest,
  deps: Pick<Deps, 'routes' | 'log'>,
): Promise<WalkRoutesResponse> {
  const pace = req.pace ?? 'normal';
  const plan = walkPlan({
    targetKcal: req.targetKcal,
    targetMin: req.targetMin,
    weightKg: req.weightKg,
    pace,
  });
  const { intensity, speedKmh } = PACE[pace];
  const netPerKm = ((metFor('walk', intensity) - 1) / speedKmh) * req.weightKg;
  const seed = Math.floor(Math.random() * 360);
  const bearings = [seed, (seed + 140) % 360];

  const options = await Promise.all(
    bearings.map(async (bearing, i): Promise<RouteOption | null> => {
      let sizeKm = plan.distanceKm;
      let waypoints = loopWaypoints(req.origin, sizeKm, bearing);
      let route: MeasuredRoute | null;
      try {
        route = await deps.routes.walkingLoop(req.origin, waypoints);
        const off = (route.distanceKm - plan.distanceKm) / plan.distanceKm;
        if (Math.abs(off) > TOLERANCE) {
          sizeKm = sizeKm * (plan.distanceKm / route.distanceKm);
          waypoints = loopWaypoints(req.origin, sizeKm, bearing);
          route = await deps.routes.walkingLoop(req.origin, waypoints);
        }
      } catch {
        deps.log.log('WARNING', 'walk.routing_failed', { option: i });
        route = null;
      }
      const distanceKm = route?.distanceKm ?? plan.distanceKm;
      const durationMin = route?.durationMin ?? (distanceKm / speedKmh) * 60;
      const kcal = distanceKm * netPerKm;
      return {
        id: `loop-${i + 1}`,
        label: i === 0 ? 'Suggested loop' : 'Another direction',
        distanceKm: Math.round(distanceKm * 10) / 10,
        // Routing assumes ~5 km/h; scale to the chosen pace.
        durationMin: Math.round(route ? (durationMin * 5) / speedKmh : durationMin),
        kcal: {
          estimate: Math.round(kcal),
          low: Math.round(kcal * 0.7),
          high: Math.round(kcal * 1.3),
        },
        origin: req.origin,
        waypoints,
        polyline: route?.polyline,
        mapsUrl: mapsWalkingUrl(req.origin, waypoints),
        warnings: route?.warnings ?? [],
        measured: Boolean(route) && deps.routes.measured,
      };
    }),
  );

  return {
    options: options.filter((o): o is RouteOption => o !== null),
    targetKm: plan.distanceKm,
    disclaimer: `${WALK_DISCLAIMER} Calories are estimated from your profile and the route.`,
  };
}
