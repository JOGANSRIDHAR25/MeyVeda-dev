import { createClient } from "@/shared/db/supabase.server";

export type InboxThread = {
  id: string;
  patientId: string;
  patientName: string;
  patientInitials: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  unreadCount: number;
  consultationId: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export class ProInboxRepository {
  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[ProInboxRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async getInboxForPractitioner(practitionerId: string): Promise<InboxThread[]> {
    const supabase = await createClient();
    const { data: consults, error } = await supabase
      .from("consultations")
      .select(`
        id, created_at, patient_id,
        patient:patients ( full_name ),
        messages:bounded_messages ( content, sent_at, read_at, direction, attachment_path, attachment_type )
      `)
      .eq("practitioner_id", practitionerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[ProInboxRepository] Error fetching inbox:", error.message);
      throw new Error("Failed to fetch inbox from database");
    }

    return (consults ?? [])
      .map((c: any) => {
        const msgs = (c.messages ?? []).sort((a: any, b: any) =>
          new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
        );
        const last = msgs[0];
        const name = c.patient?.full_name ?? "Patient";
        const sortTime = last?.sent_at ?? c.created_at;
        const unreadCount = msgs.filter((m: any) => m.direction === "patient_to_doctor" && !m.read_at).length;
        return {
          id: c.id,
          patientId: c.patient_id,
          patientName: name,
          patientInitials: name.split(" ").filter((w: string) => w).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
          lastMessage: last
            ? last.content || (last.attachment_path ? (String(last.attachment_type).startsWith("image/") ? "📷 Photo" : "📄 Document") : "")
            : "Start the conversation",
          lastMessageTime: sortTime ? timeAgo(sortTime) : "",
          unread: unreadCount > 0,
          unreadCount,
          consultationId: c.id,
          _sortTime: sortTime,
        };
      })
      .sort((a: any, b: any) => new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime())
      // One thread per patient: a person with several consultations must appear once.
      // Rows are sorted newest-first, so the first row seen is the latest consultation.
      .reduce((acc: any[], t: any) => {
        const existing = acc.find((x) => x.patientId === t.patientId);
        if (existing) {
          existing.unreadCount += t.unreadCount;
          existing.unread = existing.unreadCount > 0;
        } else {
          acc.push(t);
        }
        return acc;
      }, [])
      .map(({ _sortTime, ...thread }: any) => thread);
  }
}
