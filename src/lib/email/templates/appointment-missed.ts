import { renderEmailShell, toPlainTextRows, type EmailContent } from "./base";
import type { MissedBy } from "@/shared/appointments/attendance";

export type AppointmentMissedTemplateInput = {
  patientName: string;
  practitionerName: string;
  date: string;
  time: string;
  /** Who didn't show up — changes the wording so a doctor no-show isn't blamed on the patient. */
  missedBy?: MissedBy;
  /** Set when the appointment was for a family member — the email goes to the account owner (patientName). */
  familyMemberName?: string;
};

function introFor(
  missedBy: MissedBy | undefined,
  practitionerName: string,
  familyMemberName: string | undefined,
): string {
  const whose = familyMemberName ? `your family member ${familyMemberName}'s appointment` : "the appointment";
  if (missedBy === "practitioner") {
    return `Dr. ${practitionerName} was unable to join ${whose} below. We're sorry for the inconvenience.`;
  }
  if (missedBy === "both") {
    return `${whose} below ended without the consultation taking place.`;
  }
  return familyMemberName
    ? `it looks like your family member ${familyMemberName} missed the appointment below.`
    : "it looks like you missed the appointment below.";
}

function subjectFor(missedBy: MissedBy | undefined, familyMemberName: string | undefined): string {
  if (missedBy === "practitioner") {
    return familyMemberName
      ? `${familyMemberName}'s MeyVeda appointment did not take place`
      : "Your MeyVeda appointment did not take place";
  }
  return familyMemberName
    ? `${familyMemberName} missed a MeyVeda appointment`
    : "You missed your MeyVeda appointment";
}

export function appointmentMissedTemplate(
  input: AppointmentMissedTemplateInput,
): EmailContent {
  const rows = [
    ...(input.familyMemberName ? [{ label: "Patient", value: input.familyMemberName }] : []),
    { label: "Practitioner", value: `Dr. ${input.practitionerName}` },
    { label: "Date", value: input.date },
    { label: "Time", value: input.time },
  ];

  const intro = introFor(input.missedBy, input.practitionerName, input.familyMemberName);
  const footerNote = "You can book another appointment anytime if you would like to continue your consultation.";

  const html = renderEmailShell({
    heading: "Appointment Missed",
    intro: `Hi ${input.patientName}, ${intro}`,
    rows,
    footerNote,
  });

  const text = [
    `Hi ${input.patientName},`,
    "",
    intro.charAt(0).toUpperCase() + intro.slice(1),
    "",
    toPlainTextRows(rows),
    "",
    footerNote,
    "",
    "Regards,",
    "MeyVeda Team",
  ].join("\n");

  return {
    subject: subjectFor(input.missedBy, input.familyMemberName),
    html,
    text,
  };
}
