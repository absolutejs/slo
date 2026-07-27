export type SloDefinition = {
  id: string;
  minimumSamples?: number;
  objective: number;
  windowMs: number;
};

export type SloMeasurement = {
  end: number;
  good: number;
  start: number;
  total: number;
};

export type SloEvaluation = {
  allowedBad: number;
  budgetConsumed: number;
  budgetRemaining: number;
  burnRate: number;
  compliance: number;
  definition: SloDefinition;
  measurement: SloMeasurement;
  observedBad: number;
  status: "at-risk" | "exhausted" | "healthy" | "insufficient-data";
};

export type BurnRateWindow = {
  evaluation: SloEvaluation;
  name: string;
};

export type BurnRateDecision = {
  evidence: Array<{ burnRate: number; name: string; status: string }>;
  severity: "critical" | "none" | "warning";
  triggered: boolean;
};

export type SloReleaseGate = {
  evidence: Array<{ label: string; value: string }>;
  reason: string;
  status: "fail" | "pass" | "warn";
};

export type SloIncidentDecision = {
  action: "hold" | "open" | "resolve";
  reason: string;
};

const assertDefinition = (definition: SloDefinition) => {
  if (!definition.id.trim()) throw new Error("SLO id is required");
  if (
    !Number.isFinite(definition.objective) ||
    definition.objective <= 0 ||
    definition.objective >= 1
  )
    throw new Error("SLO objective must be between zero and one");
  if (!Number.isFinite(definition.windowMs) || definition.windowMs <= 0)
    throw new Error("SLO window must be positive");
  if ((definition.minimumSamples ?? 1) < 1)
    throw new Error("SLO minimum samples must be positive");
};

const assertMeasurement = (measurement: SloMeasurement) => {
  if (
    !Number.isFinite(measurement.good) ||
    !Number.isFinite(measurement.total) ||
    measurement.good < 0 ||
    measurement.total < 0 ||
    measurement.good > measurement.total
  )
    throw new Error("SLO measurement counts are invalid");
  if (
    !Number.isFinite(measurement.start) ||
    !Number.isFinite(measurement.end) ||
    measurement.end <= measurement.start
  )
    throw new Error("SLO measurement window is invalid");
};

export const evaluateSlo = (
  definition: SloDefinition,
  measurement: SloMeasurement,
): SloEvaluation => {
  assertDefinition(definition);
  assertMeasurement(measurement);
  const minimumSamples = definition.minimumSamples ?? 1;
  const compliance =
    measurement.total === 0 ? 0 : measurement.good / measurement.total;
  const observedBad = measurement.total - measurement.good;
  const allowedBad = measurement.total * (1 - definition.objective);
  const budgetConsumed =
    allowedBad === 0
      ? observedBad === 0
        ? 0
        : Infinity
      : observedBad / allowedBad;
  const budgetRemaining = Math.max(0, 1 - budgetConsumed);
  const burnRate = budgetConsumed;
  const status =
    measurement.total < minimumSamples
      ? "insufficient-data"
      : budgetConsumed > 1
        ? "exhausted"
        : budgetRemaining <= 0.25
          ? "at-risk"
          : "healthy";

  return {
    allowedBad,
    budgetConsumed,
    budgetRemaining,
    burnRate,
    compliance,
    definition,
    measurement,
    observedBad,
    status,
  };
};

export const evaluateBurnRates = (input: {
  criticalThreshold?: number;
  warningThreshold?: number;
  windows: readonly BurnRateWindow[];
}): BurnRateDecision => {
  if (input.windows.length === 0)
    throw new Error("At least one burn-rate window is required");
  const eligible = input.windows.filter(
    ({ evaluation }) => evaluation.status !== "insufficient-data",
  );
  const criticalThreshold = input.criticalThreshold ?? 6;
  const warningThreshold = input.warningThreshold ?? 2;
  const critical =
    eligible.length >= 2 &&
    eligible.every(
      ({ evaluation }) => evaluation.burnRate >= criticalThreshold,
    );
  const warning = eligible.some(
    ({ evaluation }) => evaluation.burnRate >= warningThreshold,
  );
  const severity = critical ? "critical" : warning ? "warning" : "none";

  return {
    evidence: input.windows.map(({ evaluation, name }) => ({
      burnRate: evaluation.burnRate,
      name,
      status: evaluation.status,
    })),
    severity,
    triggered: severity !== "none",
  };
};

export const sloReleaseGate = (
  evaluation: SloEvaluation,
  burn?: BurnRateDecision,
): SloReleaseGate => {
  const evidence = [
    {
      label: "Compliance",
      value: `${Math.round(evaluation.compliance * 10_000) / 100}%`,
    },
    {
      label: "Error budget remaining",
      value: `${Math.round(evaluation.budgetRemaining * 10_000) / 100}%`,
    },
    ...(burn ? [{ label: "Burn severity", value: burn.severity }] : []),
  ];
  if (evaluation.status === "exhausted" || burn?.severity === "critical")
    return {
      evidence,
      reason:
        "The service-level error budget is exhausted or burning critically",
      status: "fail",
    };
  if (
    evaluation.status === "insufficient-data" ||
    evaluation.status === "at-risk" ||
    burn?.severity === "warning"
  )
    return {
      evidence,
      reason:
        "The service-level objective needs more evidence or budget review",
      status: "warn",
    };

  return {
    evidence,
    reason: "The service-level objective has healthy error-budget headroom",
    status: "pass",
  };
};

export const sloIncidentDecision = (input: {
  burn?: BurnRateDecision;
  evaluation: SloEvaluation;
  incidentOpen: boolean;
}): SloIncidentDecision => {
  const unhealthy =
    input.evaluation.status === "exhausted" ||
    input.burn?.severity === "critical";
  if (unhealthy && !input.incidentOpen)
    return {
      action: "open",
      reason: "SLO error-budget exhaustion requires operator attention",
    };
  if (
    input.incidentOpen &&
    input.evaluation.status === "healthy" &&
    (!input.burn || input.burn.severity === "none")
  )
    return {
      action: "resolve",
      reason: "The SLO and burn-rate windows have recovered",
    };

  return {
    action: "hold",
    reason: "The current incident state remains consistent with SLO evidence",
  };
};
