import { FREE_PUBLIC_RECEIPT_LIMIT } from "@/lib/paywall";
import { neon } from "@neondatabase/serverless";

const PUBLIC_RECEIPT_LOCK_NAMESPACE = 747247;

export type PromotePublicReceiptResult =
  | {
      published: true;
      handle: string;
      slug: string;
    }
  | {
      published: false;
    };

export async function promoteSessionToPublicReceipt(args: {
  databaseUrl: string;
  userId: string;
  sessionId: string;
  title?: string | null;
  summary?: string | null;
  outcome?: string | null;
}): Promise<PromotePublicReceiptResult> {
  const sqlClient = neon(args.databaseUrl);
  const [, publishedRows] = await sqlClient.transaction(
    (txn) => [
      txn`select pg_advisory_xact_lock(${PUBLIC_RECEIPT_LOCK_NAMESPACE}, hashtext(${args.userId}))`,
      txn`
        with current_viewer as (
          select id, handle, plan
          from "user"
          where id = ${args.userId}
            and handle is not null
          for update
        ),
        published as (
          update trail_session
          set
            title = case when ${args.title !== undefined} then ${args.title ?? null} else title end,
            summary = case when ${args.summary !== undefined} then ${args.summary ?? null} else summary end,
            outcome = case when ${args.outcome !== undefined} then ${args.outcome ?? null} else outcome end,
            visibility = 'public',
            shared_at = coalesce(shared_at, now())
          where id = ${args.sessionId}
            and user_id = (select id from current_viewer)
            and visibility = 'private'
            and (pending_review_reasons is null or jsonb_array_length(pending_review_reasons) = 0)
            and redacted_at is null
            and ended_at is not null
            and event_count > 0
            and receipt_generated_at is not null
            and (
              exists (select 1 from current_viewer where plan = 'pro')
              or (
                select count(*)
                from trail_session public_receipts
                where public_receipts.user_id = (select id from current_viewer)
                  and public_receipts.visibility = 'public'
                  and public_receipts.receipt_generated_at is not null
              ) < ${FREE_PUBLIC_RECEIPT_LIMIT}
            )
          returning id, slug
        )
        select published.id, published.slug, current_viewer.handle
        from published
        join current_viewer on true
      `,
    ],
    { isolationLevel: "ReadCommitted" },
  );

  const published = publishedRows[0] as { handle: string; slug: string } | undefined;
  if (!published) return { published: false };
  return {
    published: true,
    handle: published.handle,
    slug: published.slug,
  };
}
