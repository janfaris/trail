/* eslint-disable */
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

(async () => {
  const before = await sql`SELECT handle, bio, github_handle FROM "user" WHERE handle = 'jankarlo.faris'`;
  console.log("user before:", before);

  await sql`UPDATE "user"
    SET bio = 'Building AI-native products in Puerto Rico.',
        github_handle = COALESCE(github_handle, handle)
    WHERE handle = 'jankarlo.faris'`;

  await sql`UPDATE trail_session SET is_featured = TRUE WHERE slug = '057smo2q'`;

  const after = await sql`SELECT handle, bio, github_handle FROM "user" WHERE handle = 'jankarlo.faris'`;
  const sess = await sql`SELECT slug, title, is_featured FROM trail_session WHERE slug = '057smo2q'`;
  console.log("user after:", after);
  console.log("session:", sess);
})();
