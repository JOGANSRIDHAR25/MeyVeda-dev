/**
 * Attendance rules for an appointment's lifecycle:
 *
 *   scheduled ──(one side arrives)──► checked_in ──(both arrived)──► in_session
 *        │                                │                            │ (call ends)
 *        └──── slot + buffer passes ──────┴──► no_show (missed)        ▼
 *                                                             awaiting notes
 *                                                                      │ (doctor saves)
 *                                                                      ▼
 *                                                                  completed
 *
 * Once both sides have been in the consultation together (in_session) the
 * appointment can never be marked missed — only completed by the doctor.
 */

export type MissedBy = "patient" | "practitioner" | "both";

/** DB statuses from which a slot may still be flipped to missed at its cutoff. */
export const MISSABLE_APPOINTMENT_STATUSES = ["scheduled", "checked_in", "rescheduled"] as const;

export function isMissableStatus(status: string | null | undefined): boolean {
  return (MISSABLE_APPOINTMENT_STATUSES as readonly string[]).includes(status ?? "");
}

/** Who didn't show up, from the join timestamps recorded on the appointment. */
export function resolveMissedBy(input: {
  mode: string | null | undefined;
  patientJoinedAt: string | null | undefined;
  practitionerJoinedAt: string | null | undefined;
}): MissedBy {
  if (input.patientJoinedAt && !input.practitionerJoinedAt) return "practitioner";
  if (input.practitionerJoinedAt && !input.patientJoinedAt) return "patient";
  // A clinic visit has no digital join — the doctor checks the patient in by
  // starting the consult, so a clinic slot nobody started is a patient no-show.
  if (input.mode === "clinic") return "patient";
  return "both";
}

export function isMissedBy(value: unknown): value is MissedBy {
  return value === "patient" || value === "practitioner" || value === "both";
}

/** The consultation happened (video call ended) but the doctor hasn't saved notes yet. */
export function isAwaitingNotes(
  status: string | null | undefined,
  videoStatus: string | null | undefined,
  sessionEndedAt: string | null | undefined,
): boolean {
  return status === "in_session" && (videoStatus === "ended" || Boolean(sessionEndedAt));
}

/** Doctor-facing reason for a missed slot. */
export const MISSED_BY_LABEL_FOR_DOCTOR: Record<MissedBy, string> = {
  patient: "Patient didn't join",
  practitioner: "You didn't join",
  both: "No one joined",
};

/** Patient-facing reason for a missed slot. */
export const MISSED_BY_LABEL_FOR_PATIENT: Record<MissedBy, string> = {
  patient: "You didn't join",
  practitioner: "Doctor didn't join",
  both: "No one joined",
};
