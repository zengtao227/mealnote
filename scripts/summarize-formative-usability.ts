import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

export const FORMATIVE_PROTOCOL_ID = "s3.5-formative-v1" as const;

export const FORMATIVE_PARTICIPANT_CODES = [
  "P001",
  "P002",
  "P003",
  "P004",
  "P005",
] as const;

export type FormativeParticipantCode = (typeof FORMATIVE_PARTICIPANT_CODES)[number];

export const FORMATIVE_REQUIRED_SESSIONS: number = FORMATIVE_PARTICIPANT_CODES.length;

export const FORMATIVE_TASK_IDS = [
  "F01_EXACT_RICE",
  "F02_OIL_CONFIRMATION",
  "F03_NESTED_RICE",
  "F04_MISSING_ITEM",
  "F05_BROAD_CORRECTION",
  "F06_UNSUPPORTED_GUARDRAIL",
] as const;

export type FormativeTaskId = (typeof FORMATIVE_TASK_IDS)[number];

export const FORMATIVE_ROTATIONS = {
  R1: FORMATIVE_TASK_IDS,
  R2: [...FORMATIVE_TASK_IDS.slice(1), FORMATIVE_TASK_IDS[0]],
  R3: [...FORMATIVE_TASK_IDS.slice(2), ...FORMATIVE_TASK_IDS.slice(0, 2)],
  R4: [...FORMATIVE_TASK_IDS.slice(3), ...FORMATIVE_TASK_IDS.slice(0, 3)],
  R5: [...FORMATIVE_TASK_IDS.slice(4), ...FORMATIVE_TASK_IDS.slice(0, 4)],
} as const satisfies Record<string, readonly FormativeTaskId[]>;

export type FormativeRotationId = keyof typeof FORMATIVE_ROTATIONS;

export const FORMATIVE_ISSUE_CODES = [
  "could_not_find_start",
  "analysis_failed",
  "food_identity_unclear",
  "portion_unclear",
  "confirmation_unclear",
  "catalog_search_unclear",
  "calculation_blocked",
  "save_unclear",
  "save_failed",
  "unsupported_dead_end",
  "unexpected_result",
] as const;

const taskIdSchema = z.enum(FORMATIVE_TASK_IDS);
const participantCodeSchema = z.enum(FORMATIVE_PARTICIPANT_CODES);
const rotationIdSchema = z.enum(Object.keys(FORMATIVE_ROTATIONS) as [
  FormativeRotationId,
  ...FormativeRotationId[],
]);
const issueCodeSchema = z.enum(FORMATIVE_ISSUE_CODES);

const actionCountsSchema = z
  .object({
    identity_edits: z.number().int().min(0).max(50),
    portion_edits: z.number().int().min(0).max(50),
    oil_edits: z.number().int().min(0).max(50),
    confirmations: z.number().int().min(0).max(50),
    catalog_adds: z.number().int().min(0).max(50),
    removals: z.number().int().min(0).max(50),
    retries: z.number().int().min(0).max(50),
  })
  .strict();

const taskObservationSchema = z
  .object({
    task_id: taskIdSchema,
    duration_ms: z.number().int().positive().max(120_000),
    outcome: z.enum(["saved", "abandoned", "guardrail-rejected"]),
    actions: actionCountsSchema,
    issue_codes: z.array(issueCodeSchema).max(FORMATIVE_ISSUE_CODES.length),
    authority_violation: z.boolean(),
  })
  .strict()
  .superRefine((observation, context): void => {
    if (new Set(observation.issue_codes).size !== observation.issue_codes.length) {
      context.addIssue({
        code: "custom",
        message: "issue_codes must be unique",
        path: ["issue_codes"],
      });
    }
    if (
      observation.task_id !== "F06_UNSUPPORTED_GUARDRAIL" &&
      observation.outcome === "guardrail-rejected"
    ) {
      context.addIssue({
        code: "custom",
        message: "guardrail-rejected is reserved for F06_UNSUPPORTED_GUARDRAIL",
        path: ["outcome"],
      });
    }
  });

export const formativeStudySessionSchema = z
  .object({
    schema_version: z.literal(1),
    protocol_id: z.literal(FORMATIVE_PROTOCOL_ID),
    participant_code: participantCodeSchema,
    rotation_id: rotationIdSchema,
    tasks: z.array(taskObservationSchema).length(FORMATIVE_TASK_IDS.length),
  })
  .strict()
  .superRefine((session, context): void => {
    const expectedOrder: readonly FormativeTaskId[] = FORMATIVE_ROTATIONS[session.rotation_id];
    const actualOrder: FormativeTaskId[] = session.tasks.map(
      (task): FormativeTaskId => task.task_id,
    );
    if (new Set(actualOrder).size !== FORMATIVE_TASK_IDS.length) {
      context.addIssue({
        code: "custom",
        message: "tasks must contain every task exactly once",
        path: ["tasks"],
      });
    }
    if (actualOrder.some((taskId: FormativeTaskId, index: number) => taskId !== expectedOrder[index])) {
      context.addIssue({
        code: "custom",
        message: `task order must match ${session.rotation_id}`,
        path: ["tasks"],
      });
    }
  });

export type FormativeTaskObservation = z.infer<typeof taskObservationSchema>;
export type FormativeStudySession = z.infer<typeof formativeStudySessionSchema>;
export type FormativeStudyStatus =
  | "FIELDWORK_INCOMPLETE"
  | "NO_GO"
  | "READY_FOR_S4_WITH_FINDINGS"
  | "READY_FOR_S4";

export interface FormativeTaskSummary {
  task_id: FormativeTaskId;
  observations: number;
  saved: number;
  completion_rate: number;
  median_saved_duration_ms?: number;
}

export interface FormativeIssueCount {
  issue_code: (typeof FORMATIVE_ISSUE_CODES)[number];
  count: number;
}

export interface FormativeStudySummary {
  protocol_id: typeof FORMATIVE_PROTOCOL_ID;
  status: FormativeStudyStatus;
  required_sessions: number;
  session_count: number;
  supported_observations: number;
  supported_saved: number;
  supported_completion_rate: number;
  median_saved_duration_ms?: number;
  p90_saved_duration_ms?: number;
  median_saved_review_actions?: number;
  guardrail_rejected: number;
  authority_violations: number;
  per_task: FormativeTaskSummary[];
  issue_counts: FormativeIssueCount[];
  findings: string[];
}

export class FormativeStudyDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormativeStudyDatasetError";
  }
}

export function parseFormativeStudySession(value: unknown): FormativeStudySession {
  return formativeStudySessionSchema.parse(value);
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted: number[] = [...values].sort((left: number, right: number) => left - right);
  const middle: number = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function nearestRankPercentile(values: number[], percentile: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new FormativeStudyDatasetError("percentile must be greater than 0 and at most 1");
  }
  const sorted: number[] = [...values].sort((left: number, right: number) => left - right);
  const rank: number = Math.ceil(percentile * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

function countReviewActions(observation: FormativeTaskObservation): number {
  return Object.values(observation.actions).reduce(
    (total: number, count: number): number => total + count,
    0,
  );
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

function validateStudySet(sessions: FormativeStudySession[]): void {
  if (sessions.length > FORMATIVE_REQUIRED_SESSIONS) {
    throw new FormativeStudyDatasetError(
      `expected at most ${FORMATIVE_REQUIRED_SESSIONS} sessions, received ${sessions.length}`,
    );
  }
  const participantCodes: string[] = sessions.map(
    (session: FormativeStudySession): string => session.participant_code,
  );
  if (new Set(participantCodes).size !== participantCodes.length) {
    throw new FormativeStudyDatasetError("participant_code must be unique across sessions");
  }
  const rotationIds: FormativeRotationId[] = sessions.map(
    (session: FormativeStudySession): FormativeRotationId => session.rotation_id,
  );
  if (new Set(rotationIds).size !== rotationIds.length) {
    throw new FormativeStudyDatasetError("rotation_id must be unique across sessions");
  }
}

export function summarizeFormativeStudy(
  untrustedSessions: unknown[],
): FormativeStudySummary {
  const sessions: FormativeStudySession[] = untrustedSessions.map(parseFormativeStudySession);
  validateStudySet(sessions);

  const observations: FormativeTaskObservation[] = sessions.flatMap(
    (session: FormativeStudySession): FormativeTaskObservation[] => session.tasks,
  );
  const supported: FormativeTaskObservation[] = observations.filter(
    (observation: FormativeTaskObservation): boolean =>
      observation.task_id !== "F06_UNSUPPORTED_GUARDRAIL",
  );
  const savedSupported: FormativeTaskObservation[] = supported.filter(
    (observation: FormativeTaskObservation): boolean => observation.outcome === "saved",
  );
  const guardrail: FormativeTaskObservation[] = observations.filter(
    (observation: FormativeTaskObservation): boolean =>
      observation.task_id === "F06_UNSUPPORTED_GUARDRAIL",
  );
  const authorityViolations: number = observations.filter(
    (observation: FormativeTaskObservation): boolean =>
      observation.authority_violation ||
      (observation.task_id === "F06_UNSUPPORTED_GUARDRAIL" && observation.outcome === "saved"),
  ).length;
  const perTask: FormativeTaskSummary[] = FORMATIVE_TASK_IDS.map(
    (taskId: FormativeTaskId): FormativeTaskSummary => {
      const taskObservations: FormativeTaskObservation[] = observations.filter(
        (observation: FormativeTaskObservation): boolean => observation.task_id === taskId,
      );
      const saved: FormativeTaskObservation[] = taskObservations.filter(
        (observation: FormativeTaskObservation): boolean => observation.outcome === "saved",
      );
      return {
        task_id: taskId,
        observations: taskObservations.length,
        saved: saved.length,
        completion_rate: percentage(saved.length, taskObservations.length),
        median_saved_duration_ms: median(
          saved.map((observation: FormativeTaskObservation): number => observation.duration_ms),
        ),
      };
    },
  );
  const issueCounts: FormativeIssueCount[] = FORMATIVE_ISSUE_CODES.map(
    (issueCode): FormativeIssueCount => ({
      issue_code: issueCode,
      count: observations.filter((observation: FormativeTaskObservation): boolean =>
        observation.issue_codes.includes(issueCode),
      ).length,
    }),
  ).filter((issue: FormativeIssueCount): boolean => issue.count > 0);

  const findings: string[] = [];
  const fieldworkComplete: boolean = sessions.length === FORMATIVE_REQUIRED_SESSIONS;
  const underperformingTasks: FormativeTaskSummary[] = perTask.filter(
    (task: FormativeTaskSummary): boolean =>
      task.task_id !== "F06_UNSUPPORTED_GUARDRAIL" &&
      fieldworkComplete &&
      task.saved < 4,
  );
  const savedDurations: number[] = savedSupported.map(
    (observation: FormativeTaskObservation): number => observation.duration_ms,
  );
  const medianSavedDuration: number | undefined = median(savedDurations);
  const guardrailRejected: number = guardrail.filter(
    (observation: FormativeTaskObservation): boolean =>
      observation.outcome === "guardrail-rejected",
  ).length;
  const guardrailUnderperforming: boolean = fieldworkComplete && guardrailRejected < 4;

  if (!fieldworkComplete) {
    findings.push(
      `Fieldwork requires ${FORMATIVE_REQUIRED_SESSIONS} sessions; ${sessions.length} are present.`,
    );
  }
  if (authorityViolations > 0) {
    findings.push(`${authorityViolations} nutrition-authority violation(s) observed.`);
  }
  for (const task of underperformingTasks) {
    findings.push(`${task.task_id} saved by only ${task.saved}/${FORMATIVE_REQUIRED_SESSIONS}.`);
  }
  if (guardrailUnderperforming) {
    findings.push(
      `F06_UNSUPPORTED_GUARDRAIL reached safe rejection for only ${guardrailRejected}/${FORMATIVE_REQUIRED_SESSIONS}.`,
    );
  }
  if (fieldworkComplete && medianSavedDuration !== undefined && medianSavedDuration > 10_000) {
    findings.push(
      `Saved-task median ${formatDuration(medianSavedDuration)} exceeds the PRD 10-second target; this formative sample is diagnostic, not release validation.`,
    );
  }

  let status: FormativeStudyStatus;
  if (authorityViolations > 0) {
    status = "NO_GO";
  } else if (!fieldworkComplete) {
    status = "FIELDWORK_INCOMPLETE";
  } else if (underperformingTasks.length > 0 || guardrailUnderperforming) {
    status = "NO_GO";
  } else if (medianSavedDuration !== undefined && medianSavedDuration > 10_000) {
    status = "READY_FOR_S4_WITH_FINDINGS";
  } else {
    status = "READY_FOR_S4";
  }

  return {
    protocol_id: FORMATIVE_PROTOCOL_ID,
    status,
    required_sessions: FORMATIVE_REQUIRED_SESSIONS,
    session_count: sessions.length,
    supported_observations: supported.length,
    supported_saved: savedSupported.length,
    supported_completion_rate: percentage(savedSupported.length, supported.length),
    median_saved_duration_ms: medianSavedDuration,
    p90_saved_duration_ms: nearestRankPercentile(savedDurations, 0.9),
    median_saved_review_actions: median(savedSupported.map(countReviewActions)),
    guardrail_rejected: guardrailRejected,
    authority_violations: authorityViolations,
    per_task: perTask,
    issue_counts: issueCounts,
    findings,
  };
}

function formatDuration(durationMs: number | undefined): string {
  return durationMs === undefined ? "n/a" : `${(durationMs / 1000).toFixed(1)} s`;
}

export function renderFormativeStudySummary(summary: FormativeStudySummary): string {
  const taskRows: string[] = summary.per_task.map(
    (task: FormativeTaskSummary): string =>
      `| ${task.task_id} | ${task.saved}/${task.observations} | ${task.completion_rate.toFixed(1)}% | ${formatDuration(task.median_saved_duration_ms)} |`,
  );
  const issueRows: string[] = summary.issue_counts.map(
    (issue: FormativeIssueCount): string => `| ${issue.issue_code} | ${issue.count} |`,
  );
  const findingRows: string[] = summary.findings.map((finding: string): string => `- ${finding}`);

  return `# S3.5 formative usability summary

> Generated from pseudonymous, enum-only local session files. This five-person formative study is diagnostic and is not M5 release validation.

## Decision

- Status: **${summary.status}**
- Sessions: ${summary.session_count}/${summary.required_sessions}
- Nutrition-authority violations: ${summary.authority_violations}
- Unsupported-food guardrail rejected safely: ${summary.guardrail_rejected}/${summary.session_count}

## Primary metrics

- Supported-task save completion: ${summary.supported_saved}/${summary.supported_observations} (${summary.supported_completion_rate.toFixed(1)}%)
- Saved-task median duration: ${formatDuration(summary.median_saved_duration_ms)}
- Saved-task P90 duration (nearest rank): ${formatDuration(summary.p90_saved_duration_ms)}
- Saved-task median review actions: ${summary.median_saved_review_actions ?? "n/a"}

| Task | Saved | Completion | Median saved duration |
| --- | ---: | ---: | ---: |
${taskRows.join("\n")}

## Enumerated issues

| Issue code | Observations |
| --- | ---: |
${issueRows.join("\n") || "| — | 0 |"}

## Findings

${findingRows.join("\n") || "- None."}
`;
}

export function loadFormativeStudySessions(resultsDirectory: string): unknown[] {
  if (!existsSync(resultsDirectory)) {
    return [];
  }
  const filenames: string[] = readdirSync(resultsDirectory)
    .filter((filename: string): boolean => filename.endsWith(".json"))
    .sort((left: string, right: string): number => left.localeCompare(right));
  return filenames.map((filename: string): unknown => {
    const filePath: string = resolve(resultsDirectory, filename);
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : "unknown JSON error";
      throw new FormativeStudyDatasetError(`${filename}: ${message}`);
    }
  });
}

function runCli(): void {
  const resultsDirectory: string = resolve(
    process.argv[2] ?? "studies/formative/s3.5-v1/results",
  );
  const outputPath: string | undefined = process.argv[3]
    ? resolve(process.argv[3])
    : undefined;
  try {
    const sessions: unknown[] = loadFormativeStudySessions(resultsDirectory);
    const summary: FormativeStudySummary = summarizeFormativeStudy(sessions);
    const rendered: string = renderFormativeStudySummary(summary);
    if (outputPath) {
      writeFileSync(outputPath, rendered, "utf8");
    }
    process.stdout.write(rendered);
    process.exitCode = summary.status.startsWith("READY_FOR_S4") ? 0 : 2;
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : "unknown study error";
    process.stderr.write(`Formative study validation failed: ${message}\n`);
    process.exitCode = 1;
  }
}

const executedFile: string | undefined = process.argv[1];
if (executedFile && import.meta.url === pathToFileURL(executedFile).href) {
  runCli();
}
