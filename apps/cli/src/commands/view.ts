import { Command } from "commander";
import chalk from "chalk";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { db } from "../db.js";
import { VIEWER_HTML } from "../viewer-html.js";

export function viewCommand(): Command {
  return new Command("view")
    .description("Spawn local web viewer on http://localhost:7777")
    .option("-p, --port <port>", "port to listen on", "7777")
    .action((opts: { port: string }) => {
      const app = new Hono();
      const port = Number.parseInt(opts.port, 10) || 7777;

      app.get("/", (c) => c.html(VIEWER_HTML));

      app.get("/api/sessions", (c) => {
        const rows = db
          .prepare(
            `SELECT s.id, s.user, s.tool, s.started_at AS startedAt,
                    s.ended_at AS endedAt, s.repo,
                    (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id) AS eventCount
             FROM sessions s
             ORDER BY s.started_at DESC
             LIMIT 200`,
          )
          .all();
        return c.json(rows);
      });

      app.get("/api/sessions/:id", (c) => {
        const id = c.req.param("id");
        const session = db
          .prepare(
            `SELECT id, user, tool, started_at AS startedAt, ended_at AS endedAt, repo
             FROM sessions WHERE id = ?`,
          )
          .get(id);
        if (!session) return c.json({ error: "not found" }, 404);
        const events = (
          db
            .prepare(
              `SELECT at, kind, payload FROM events WHERE session_id = ? ORDER BY id ASC`,
            )
            .all(id) as Array<{ at: string; kind: string; payload: string }>
        ).map((r) => JSON.parse(r.payload));
        return c.json({ ...(session as object), events });
      });

      serve({ fetch: app.fetch, port }, (info) => {
        console.log(
          chalk.cyan("trail view"),
          "→",
          chalk.green(`http://localhost:${info.port}`),
        );
      });
    });
}
