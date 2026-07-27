import { describe, expect, test } from "bun:test";
import {
  evaluateBurnRates,
  evaluateSlo,
  sloIncidentDecision,
  sloReleaseGate,
} from "../src";

const definition = {
  id: "checkout-availability",
  minimumSamples: 100,
  objective: 0.99,
  windowMs: 30 * 86_400_000,
};

describe("SLO decisions", () => {
  test("calculates error-budget exhaustion and blocks release", () => {
    const evaluation = evaluateSlo(definition, {
      end: 2,
      good: 970,
      start: 1,
      total: 1_000,
    });

    expect(evaluation.status).toBe("exhausted");
    expect(evaluation.burnRate).toBeCloseTo(3);
    expect(sloReleaseGate(evaluation).status).toBe("fail");
  });

  test("requires sustained multi-window evidence for a critical burn", () => {
    const evaluation = evaluateSlo(definition, {
      end: 2,
      good: 900,
      start: 1,
      total: 1_000,
    });
    const burn = evaluateBurnRates({
      windows: [
        { evaluation, name: "five-minutes" },
        { evaluation, name: "one-hour" },
      ],
    });

    expect(burn.severity).toBe("critical");
    expect(
      sloIncidentDecision({ burn, evaluation, incidentOpen: false }).action,
    ).toBe("open");
  });

  test("warns rather than fabricating confidence from a cold start", () => {
    const evaluation = evaluateSlo(definition, {
      end: 2,
      good: 5,
      start: 1,
      total: 5,
    });

    expect(evaluation.status).toBe("insufficient-data");
    expect(sloReleaseGate(evaluation).status).toBe("warn");
  });
});
