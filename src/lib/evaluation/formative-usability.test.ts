import { describe, expect, it } from "vitest";

import {
  FORMATIVE_PARTICIPANT_CODES,
  FORMATIVE_ROTATIONS,
  FORMATIVE_TASK_IDS,
  median,
  nearestRankPercentile,
  parseFormativeStudySession,
  renderFormativeStudySummary,
  summarizeFormativeStudy,
  type FormativeParticipantCode,
  type FormativeRotationId,
  type FormativeStudySession,
  type FormativeTaskId,
} from "../../../scripts/summarize-formative-usability";

function createSession(
  participantCode: FormativeParticipantCode,
  rotationId: FormativeRotationId,
  durationMs: number = 8_000,
): FormativeStudySession {
  return {
    schema_version: 1,
    protocol_id: "s3.5-formative-v1",
    participant_code: participantCode,
    rotation_id: rotationId,
    tasks: FORMATIVE_ROTATIONS[rotationId].map(
      (taskId: FormativeTaskId) => ({
        task_id: taskId,
        duration_ms: durationMs,
        outcome: taskId === "F06_UNSUPPORTED_GUARDRAIL" ? "guardrail-rejected" : "saved",
        actions: {
          identity_edits: 0,
          portion_edits: 0,
          oil_edits: 0,
          confirmations: 0,
          catalog_adds: 0,
          removals: 0,
          retries: 0,
        },
        issue_codes: [],
        authority_violation: false,
      }),
    ),
  };
}

function createCompleteStudy(durationMs: number = 8_000): FormativeStudySession[] {
  return (Object.keys(FORMATIVE_ROTATIONS) as FormativeRotationId[]).map(
    (rotationId: FormativeRotationId, index: number): FormativeStudySession =>
      createSession(FORMATIVE_PARTICIPANT_CODES[index], rotationId, durationMs),
  );
}

describe("formative usability session validation", () => {
  it("accepts one strict pseudonymous session in its declared rotation", () => {
    expect(parseFormativeStudySession(createSession("P001", "R1"))).toMatchObject({
      participant_code: "P001",
      rotation_id: "R1",
    });
  });

  it("rejects participant codes outside the predeclared P001-P005 slots", () => {
    for (const participantCode of ["P006", "PABC"]) {
      const invalidSession: unknown = {
        ...createSession("P001", "R1"),
        participant_code: participantCode,
      };
      expect(() => parseFormativeStudySession(invalidSession)).toThrow();
      expect(() => summarizeFormativeStudy([invalidSession])).toThrow();
    }
  });

  it("rejects free-text fields, duplicate issue codes, and a reordered task list", () => {
    const withFreeText: unknown = {
      ...createSession("P001", "R1"),
      participant_name: "must not be collected",
    };
    expect(() => parseFormativeStudySession(withFreeText)).toThrow();

    const duplicateIssues: FormativeStudySession = createSession("P001", "R1");
    duplicateIssues.tasks[0].issue_codes = ["analysis_failed", "analysis_failed"];
    expect(() => parseFormativeStudySession(duplicateIssues)).toThrow(/issue_codes must be unique/);

    const reordered: FormativeStudySession = createSession("P001", "R1");
    [reordered.tasks[0], reordered.tasks[1]] = [reordered.tasks[1], reordered.tasks[0]];
    expect(() => parseFormativeStudySession(reordered)).toThrow(/task order must match R1/);
  });
});

describe("formative usability metrics and decision gate", () => {
  it("keeps the gate incomplete until all five rotations are present", () => {
    const summary = summarizeFormativeStudy(createCompleteStudy().slice(0, 4));

    expect(summary.status).toBe("FIELDWORK_INCOMPLETE");
    expect(summary.session_count).toBe(4);
    expect(summary.findings).toContain("Fieldwork requires 5 sessions; 4 are present.");
  });

  it("marks a complete low-friction, authority-safe study ready for S4", () => {
    const summary = summarizeFormativeStudy(createCompleteStudy());

    expect(summary).toMatchObject({
      status: "READY_FOR_S4",
      session_count: 5,
      supported_observations: 25,
      supported_saved: 25,
      supported_completion_rate: 100,
      median_saved_duration_ms: 8_000,
      p90_saved_duration_ms: 8_000,
      guardrail_rejected: 5,
      authority_violations: 0,
    });
  });

  it("reports the PRD time miss without pretending the formative study is release validation", () => {
    const summary = summarizeFormativeStudy(createCompleteStudy(12_000));

    expect(summary.status).toBe("READY_FOR_S4_WITH_FINDINGS");
    expect(summary.findings.join(" ")).toContain("exceeds the PRD 10-second target");
  });

  it("returns NO_GO when two participants cannot save the same supported task", () => {
    const sessions: FormativeStudySession[] = createCompleteStudy();
    for (const session of sessions.slice(0, 2)) {
      const task = session.tasks.find(
        (observation): boolean => observation.task_id === "F04_MISSING_ITEM",
      );
      if (!task) {
        throw new Error("F04_MISSING_ITEM is required");
      }
      task.outcome = "abandoned";
      task.issue_codes = ["catalog_search_unclear"];
    }

    const summary = summarizeFormativeStudy(sessions);
    expect(summary.status).toBe("NO_GO");
    expect(summary.findings).toContain("F04_MISSING_ITEM saved by only 3/5.");
  });

  it("derives an authority violation when the unsupported guardrail is saved", () => {
    const sessions: FormativeStudySession[] = createCompleteStudy();
    const guardrail = sessions[0].tasks.find(
      (observation): boolean => observation.task_id === "F06_UNSUPPORTED_GUARDRAIL",
    );
    if (!guardrail) {
      throw new Error("F06_UNSUPPORTED_GUARDRAIL is required");
    }
    guardrail.outcome = "saved";

    const summary = summarizeFormativeStudy(sessions);
    expect(summary.status).toBe("NO_GO");
    expect(summary.authority_violations).toBe(1);
  });

  it("returns NO_GO when fewer than four participants understand the safe guardrail stop", () => {
    const sessions: FormativeStudySession[] = createCompleteStudy();
    for (const session of sessions.slice(0, 2)) {
      const guardrail = session.tasks.find(
        (observation): boolean => observation.task_id === "F06_UNSUPPORTED_GUARDRAIL",
      );
      if (!guardrail) {
        throw new Error("F06_UNSUPPORTED_GUARDRAIL is required");
      }
      guardrail.outcome = "abandoned";
      guardrail.issue_codes = ["unsupported_dead_end"];
    }

    const summary = summarizeFormativeStudy(sessions);
    expect(summary.status).toBe("NO_GO");
    expect(summary.guardrail_rejected).toBe(3);
    expect(summary.findings).toContain(
      "F06_UNSUPPORTED_GUARDRAIL reached safe rejection for only 3/5.",
    );
  });

  it("keeps percentile math deterministic and rendered output pseudonymous", () => {
    expect(median([1, 3, 2, 4])).toBe(2.5);
    expect(nearestRankPercentile([1, 2, 3, 4, 5], 0.9)).toBe(5);

    const rendered: string = renderFormativeStudySummary(
      summarizeFormativeStudy(createCompleteStudy()),
    );
    expect(rendered).toContain("Supported-task save completion: 25/25 (100.0%)");
    expect(rendered).not.toContain("P001");
    for (const taskId of FORMATIVE_TASK_IDS) {
      expect(rendered).toContain(taskId);
    }
  });

  it("rejects duplicate participants, duplicate rotations, and excess sessions", () => {
    const duplicateParticipant: FormativeStudySession[] = createCompleteStudy().slice(0, 2);
    duplicateParticipant[1].participant_code = duplicateParticipant[0].participant_code;
    expect(() => summarizeFormativeStudy(duplicateParticipant)).toThrow(
      /participant_code must be unique/,
    );

    const duplicateRotation: FormativeStudySession[] = createCompleteStudy().slice(0, 2);
    duplicateRotation[1] = createSession("P002", "R1");
    expect(() => summarizeFormativeStudy(duplicateRotation)).toThrow(
      /rotation_id must be unique/,
    );

    const excess: FormativeStudySession[] = [
      ...createCompleteStudy(),
      createSession("P001", "R1"),
    ];
    expect(() => summarizeFormativeStudy(excess)).toThrow(/expected at most 5 sessions/);
  });
});
