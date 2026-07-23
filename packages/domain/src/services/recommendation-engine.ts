import { Vehicle } from "../entities/vehicle";

export interface CustomerSignal {
  wishlistedVehicles: Vehicle[];
  pastBookedVehicles: Vehicle[];
}

export interface ScoredVehicle {
  vehicle: Vehicle;
  score: number;
  reasons: string[];
}

/**
 * Heuristic, rule-based recommender (per product decision: no external AI/LLM provider yet).
 * Implements the `RecommendationEngine` port so a future LLM-backed implementation can be
 * swapped in later without touching any caller.
 */
export interface RecommendationEngine {
  recommend(signal: CustomerSignal, candidates: Vehicle[], limit?: number): ScoredVehicle[];
}

export class HeuristicRecommendationEngine implements RecommendationEngine {
  recommend(signal: CustomerSignal, candidates: Vehicle[], limit = 5): ScoredVehicle[] {
    const priorVehicles = [...signal.wishlistedVehicles, ...signal.pastBookedVehicles];
    const bodyTypeAffinity = this.frequencyOf(priorVehicles, (v) => v.toProps().bodyType);
    const fuelTypeAffinity = this.frequencyOf(priorVehicles, (v) => v.toProps().fuelType);
    const avgPrice = this.averagePrice(priorVehicles);

    const scored = candidates.map((vehicle) => {
      const props = vehicle.toProps();
      let score = 0;
      const reasons: string[] = [];

      const bodyAffinity = bodyTypeAffinity.get(props.bodyType) ?? 0;
      if (bodyAffinity > 0) {
        score += bodyAffinity * 3;
        reasons.push(`Matches your interest in ${props.bodyType} vehicles`);
      }

      const fuelAffinity = fuelTypeAffinity.get(props.fuelType) ?? 0;
      if (fuelAffinity > 0) {
        score += fuelAffinity * 2;
        reasons.push(`Matches your interest in ${props.fuelType} vehicles`);
      }

      if (avgPrice > 0) {
        const priceDelta = Math.abs(props.price.amount - avgPrice) / avgPrice;
        if (priceDelta < 0.2) {
          score += 2;
          reasons.push("Similarly priced to vehicles you've shown interest in");
        }
      }

      if (props.isFeatured) {
        score += 1;
        reasons.push("Featured vehicle");
      }

      return { vehicle, score, reasons };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private frequencyOf<T>(items: T[], key: (item: T) => string): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of items) {
      const k = key(item);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }

  private averagePrice(vehicles: Vehicle[]): number {
    if (vehicles.length === 0) return 0;
    const total = vehicles.reduce((sum, v) => sum + v.toProps().price.amount, 0);
    return total / vehicles.length;
  }
}

export interface FunnelStageCounts {
  requested: number;
  confirmed: number;
  completed: number;
  opportunitiesCreated: number;
}

export interface FunnelInsight {
  conversionRate: number;
  dropOffStage: "requested-to-confirmed" | "confirmed-to-completed" | "completed-to-opportunity" | "none";
  summary: string;
}

/**
 * Heuristic funnel/insight analysis for manager dashboards. Rule-based today;
 * the interface allows a future ML/LLM-backed InsightEngine to replace this
 * without changing the analytics module that calls it.
 */
export interface InsightEngine {
  analyzeFunnel(counts: FunnelStageCounts): FunnelInsight;
}

export class HeuristicInsightEngine implements InsightEngine {
  analyzeFunnel(counts: FunnelStageCounts): FunnelInsight {
    const { requested, confirmed, completed, opportunitiesCreated } = counts;
    const conversionRate = requested > 0 ? opportunitiesCreated / requested : 0;

    const stageRates = [
      { stage: "requested-to-confirmed" as const, rate: requested > 0 ? confirmed / requested : 1 },
      { stage: "confirmed-to-completed" as const, rate: confirmed > 0 ? completed / confirmed : 1 },
      { stage: "completed-to-opportunity" as const, rate: completed > 0 ? opportunitiesCreated / completed : 1 },
    ];

    const worst = stageRates.reduce((min, curr) => (curr.rate < min.rate ? curr : min));
    const dropOffStage = worst.rate < 0.7 ? worst.stage : "none";

    const summary =
      dropOffStage === "none"
        ? `Healthy funnel — ${(conversionRate * 100).toFixed(1)}% of requests became opportunities.`
        : `Largest drop-off is at "${dropOffStage}" (${(worst.rate * 100).toFixed(1)}% conversion). Overall ${(conversionRate * 100).toFixed(1)}% of requests became opportunities.`;

    return { conversionRate, dropOffStage, summary };
  }
}
