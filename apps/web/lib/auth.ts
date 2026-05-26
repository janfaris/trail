import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      account: schema.account,
      session: schema.session,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      // Request public_repo so we can call listPullRequestsAssociatedWithCommit
      // on the user's repos for PR auto-linking. This is the minimum scope that
      // works for public repos; private repos require full `repo` scope, which
      // we deliberately don't ask for (it would surface a "wants full repo
      // access" prompt that scares users off). Private-repo PR links remain
      // null, which is fine — the dashboard still surfaces cost-per-PR for
      // any public repo the user ships to.
      scope: ["read:user", "user:email", "public_repo"],
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  // Preview deploys land at trail-git-<branch>-jan-faris-projects-cfb42434.vercel.app.
  // Trust the production origin, the project's vercel.app aliases, and localhost.
  // Without this, server-side auth.api.getSession() throws on preview branches with
  // a BetterAuthError instead of returning null, which 500s any page that gates on auth.
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "https://trail.dev",
    "https://www.trail.dev",
    // Wildcard catches every vercel.app preview URL for this project.
    "https://*.vercel.app",
  ].filter(Boolean) as string[],
  user: {
    additionalFields: {
      handle: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // try to derive handle from github profile
          const profile = (ctx as { profile?: { login?: string } } | undefined)?.profile;
          const login = profile?.login;
          return {
            data: {
              ...user,
              handle: login || (user.email?.split("@")[0] ?? user.id.slice(0, 8)),
            },
          };
        },
      },
    },
  },
});
