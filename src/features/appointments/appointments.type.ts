import type { MissedBy } from "@/shared/appointments/attendance";

export type AppointmentRow = {
  id: string;
  doctor: string;
  practitionerId: string;
  consultationId?: string;
  initials: string;
  timeRaw: string;
  specialty: string;
  date: string;
  dateRaw: string;
  mode: "video" | "clinic";
  status: "upcoming" | "past" | "cancelled";
  pastOutcome?: "completed" | "missed" | "awaiting_notes";
  /** For a missed appointment: who didn't show up. */
  missedBy?: MissedBy;
  /** Both sides have joined and the consultation is happening right now. */
  inSession?: boolean;
  fee: string;
  duration?: string;
  rating?: number;
  hasPrescription?: boolean;
  reason?: string;
  refunded?: boolean;
  reminder: boolean;
};