import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

async function signOutAction() {
  "use server";
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
