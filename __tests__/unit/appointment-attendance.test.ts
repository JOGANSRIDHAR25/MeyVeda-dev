import { describe, expect, it } from "vitest";

import {
  isAwaitingNotes,
  isMissableStatus,
  isMissedBy,
  resolveMissedBy,
} from "@/shared/appointments/attendance";
import { appointmentMissedTemplate } from "@/lib/email/templates/appointment-missed";

describe("isMissableStatus", () => {
  it("allows missing a slot nobody has been in together yet", () => {
    expect(isMissableStatus("scheduled")).toBe(true);
    expect(isMissableStatus("rescheduled")).toBe(true);
    expect(isMissableStatus("checked_in")).toBe(true);
  });

  it("never misses a consultation that happened or is already resolved", () => {
    expect(isMissableStatus("in_session")).toBe(false);
    expect(isMissableStatus("completed")).toBe(false);
    expect(isMissableStatus("cancelled")).toBe(false);
    expect(isMissableStatus("no_show")).toBe(false);
    expect(isMissableStatus(null)).toBe(false);
  });
});

describe("resolveMissedBy", () => {
  const at = "2026-09-29T10:00:00.000Z";

  it("blames the doctor when only the patient joined", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: at, practitionerJoinedAt: null })).toBe("practitioner");
  });

  it("blames the patient when only the doctor joined", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: null, practitionerJoinedAt: at })).toBe("patient");
  });

  it("records both when nobody joined a video slot", () => {
    expect(resolveMissedBy({ mode: "video", patientJoinedAt: null, practitionerJoinedAt: null })).toBe("both");
  });

  it("treats an unstarted clinic slot as a patient no-show", () => {
    expect(resolveMissedBy({ mode: "clinic", patientJoinedAt: null, practitionerJoinedAt: null })).toBe("patient");
  });
});

describe("isAwaitingNotes", () => {
  it("is true once the call has ended for an in-session appointment", () => {
    expect(isAwaitingNotes("in_session", "ended", null)).toBe(true);
    expect(isAwaitingNotes("in_session", "in_progress", "2026-09-29T10:20:00.000Z")).toBe(true);
  });

  it("is false while the call is live or once completed", () => {
    expect(isAwaitingNotes("in_session", "in_progress", null)).toBe(false);
    expect(isAwaitingNotes("completed", "ended", "2026-09-29T10:20:00.000Z")).toBe(false);
  });
});

describe("isMissedBy", () => {
  it("accepts only known values", () => {
    expect(isMissedBy("patient")).toBe(true);
    expect(isMissedBy("practitioner")).toBe(true);
    expect(isMissedBy("both")).toBe(true);
    expect(isMissedBy("doctor")).toBe(false);
    expect(isMissedBy(null)).toBe(false);
  });
});

describe("appointmentMissedTemplate", () => {
  const base = { patientName: "Asha", practitionerName: "Rao", date: "September 29, 2026", time: "10:00 AM" };

  it("tells the patient they missed it by default", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "patient" });
    expect(email.subject).toBe("You missed your MeyVeda appointment");
    expect(email.text).toContain("It looks like you missed");
  });

  it("does not blame the patient when the doctor didn't join", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "practitioner" });
    expect(email.subject).toBe("Your MeyVeda appointment did not take place");
    expect(email.text).toContain("Dr. Rao was unable to join");
    expect(email.text).not.toContain("you missed");
  });
});

describe("appointmentMissedTemplate for a family member", () => {
  const base = { patientName: "Priya", practitionerName: "Rao", date: "September 29, 2026", time: "10:00 AM", familyMemberName: "Ravi" };

  it("tells the account owner their family member missed it", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "patient" });
    expect(email.subject).toBe("Ravi missed a MeyVeda appointment");
    expect(email.text).toContain("Hi Priya,");
    expect(email.text).toContain("your family member Ravi missed the appointment below");
    expect(email.text).toContain("Patient: Ravi");
  });

  it("names the family member when the doctor didn't join", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "practitioner" });
    expect(email.subject).toBe("Ravi's MeyVeda appointment did not take place");
    expect(email.text).toContain("Dr. Rao was unable to join your family member Ravi's appointment below");
  });

  it("capitalises the sentence when nobody joined", () => {
    const email = appointmentMissedTemplate({ ...base, missedBy: "both" });
    expect(email.text).toContain("Your family member Ravi's appointment below ended without the consultation taking place.");
  });
});
