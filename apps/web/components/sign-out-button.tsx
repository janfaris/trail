import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function signOutAction() {
  "use server";
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
    redirect("/");
  }

  const { auth } = await import("@/lib/auth");
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export function SignOutButton({
  className,
  children = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          className ??
          "text-zinc-400 hover:text-zinc-100 transition-colors text-sm"
        }
      >
        {children}
      </button>
    </form>
  );
}
