import { createClient } from "@/shared/db/supabase.server";

export type CommunityMessage = {
  id: string;
  content: string;
  sentAt: string;
  senderName: string;
  isMine: boolean;
  attachment: { name: string; type: string; size: number; url: string } | null;
  replyTo: { senderName: string; content: string } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
};

export const COMMUNITY_ATTACHMENT_BUCKET = "community-attachments";

export class CommunityRepository {
  static async getPractitionerIdFromUserId(userId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("practitioners").select("id").eq("user_id", userId).maybeSingle();
    if (error) {
      console.error("[CommunityRepository] Error resolving practitioner_id:", error.message);
      return null;
    }
    return data?.id ?? null;
  }

  static async isMember(practitionerId: string): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_members")
      .select("practitioner_id")
      .eq("practitioner_id", practitionerId)
      .maybeSingle();
    if (error) throw new Error("Failed to check community membership");
    return !!data;
  }

  static async countMembers(): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase.from("community_members").select("practitioner_id", { count: "exact", head: true });
    if (error) throw new Error("Failed to count community members");
    return count ?? 0;
  }

  static async join(practitionerId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("community_members")
      .upsert({ practitioner_id: practitionerId }, { onConflict: "practitioner_id" });
    if (error) {
      console.error("[CommunityRepository] join failed:", error.message);
      throw new Error("Failed to join the community");
    }
  }

  static async leave(practitionerId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("community_members").delete().eq("practitioner_id", practitionerId);
    if (error) {
      console.error("[CommunityRepository] leave failed:", error.message);
      throw new Error("Failed to leave the community");
    }
  }

  static async listMessages(practitionerId: string): Promise<CommunityMessage[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("community_messages")
      .select(`
        id, content, created_at, practitioner_id, reply_to_id,
        attachment_path, attachment_name, attachment_type, attachment_size,
        author:practitioners!community_messages_practitioner_id_fkey ( full_name ),
        reactions:community_reactions ( emoji, practitioner_id )
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[CommunityRepository] listMessages failed:", error.message);
      throw new Error("Failed to load community messages");
    }

    const rows = (data ?? []).reverse() as any[];
    const one = (v: any) => (Array.isArray(v) ? v[0] : v);
    const byId = new Map<string, any>(rows.map((r) => [r.id, r]));

    const previewOf = (r: any) => r.content || (r.attachment_path ? "📎 Attachment" : "");

    return Promise.all(
      rows.map(async (m) => {
        let attachment: CommunityMessage["attachment"] = null;
        if (m.attachment_path) {
          const { data: signed, error: signError } = await supabase.storage
            .from(COMMUNITY_ATTACHMENT_BUCKET)
            .createSignedUrl(m.attachment_path, 3600);
          if (signError) console.error("[CommunityRepository] Error signing attachment:", signError.message);
          attachment = {
            name: m.attachment_name ?? "Attachment",
            type: m.attachment_type ?? "",
            size: m.attachment_size ?? 0,
            url: signed?.signedUrl ?? "",
          };
        }

        const target = m.reply_to_id ? byId.get(m.reply_to_id) : null;
        const replyTo = m.reply_to_id
          ? {
              senderName: target ? one(target.author)?.full_name ?? "Doctor" : "Earlier message",
              content: target ? previewOf(target) : "",
            }
          : null;

        const counts = new Map<string, { count: number; mine: boolean }>();
        for (const r of m.reactions ?? []) {
          const entry = counts.get(r.emoji) ?? { count: 0, mine: false };
          entry.count += 1;
          if (r.practitioner_id === practitionerId) entry.mine = true;
          counts.set(r.emoji, entry);
        }

        return {
          id: m.id,
          content: m.content ?? "",
          sentAt: new Date(m.created_at).toLocaleString("en-IN"),
          senderName: one(m.author)?.full_name ?? "Doctor",
          isMine: m.practitioner_id === practitionerId,
          attachment,
          replyTo,
          reactions: Array.from(counts, ([emoji, v]) => ({ emoji, ...v })),
        };
      })
    );
  }

  static async sendMessage(
    practitionerId: string,
    content: string,
    replyToId?: string | null,
    attachment?: { path: string; name: string; type: string; size: number }
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("community_messages").insert({
      practitioner_id: practitionerId,
      content,
      reply_to_id: replyToId || null,
      ...(attachment
        ? {
            attachment_path: attachment.path,
            attachment_name: attachment.name,
            attachment_type: attachment.type,
            attachment_size: attachment.size,
          }
        : {}),
    });
    if (error) {
      console.error("[CommunityRepository] sendMessage failed:", error.message);
      throw new Error("Failed to send message");
    }
  }

  static async toggleReaction(practitionerId: string, messageId: string, emoji: string): Promise<void> {
    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase
      .from("community_reactions")
      .select("emoji")
      .eq("message_id", messageId)
      .eq("practitioner_id", practitionerId)
      .maybeSingle();
    if (readError) throw new Error("Failed to update reaction");

    const { error: clearError } = await supabase
      .from("community_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("practitioner_id", practitionerId);
    if (clearError) throw new Error("Failed to update reaction");

    if (existing?.emoji === emoji) return;

    const { error } = await supabase
      .from("community_reactions")
      .insert({ message_id: messageId, practitioner_id: practitionerId, emoji });
    if (error) {
      console.error("[CommunityRepository] toggleReaction failed:", error.message);
      throw new Error("Failed to update reaction");
    }
  }

  static async createAttachmentUploadTarget(path: string): Promise<{ path: string; token: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(COMMUNITY_ATTACHMENT_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("[CommunityRepository] Error creating upload URL:", error?.message);
      throw new Error("Failed to prepare attachment upload");
    }
    return { path: data.path, token: data.token };
  }
}
