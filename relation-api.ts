import http from "http";
import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "tags-data",
  user: "postgres",
  password: "d3_priynka_jonas",
  max: 10,
});

function sendJSON(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseQuery(url: string): Record<string, string> {
  const queryStr = url.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(queryStr));
}

async function handleRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const path    = req.url?.split("?")[0] || "/";
  const query   = parseQuery(req.url || "");
  const limit   = Math.min(parseInt(query.limit || "10"), 100);
  const offset  = parseInt(query.offset || "0");

  if (path === "/health" && req.method === "GET") {
    return sendJSON(res, 200, { status: "ok", approach: "relational" });
  }

  if (path === "/videos" && req.method === "GET") {
    const result = await pool.query(
      `SELECT
         sv.id,
         sv.title,
         sv.description,
         sv.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id',       t.id,
               'name',     t.name,
               'slug',     t.slug,
               'tag_type', t.tag_type
             )
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM short_videos sv
       LEFT JOIN content_tags ct ON sv.id = ct.content_id
       LEFT JOIN tags t ON ct.tag_id = t.id
       GROUP BY sv.id, sv.title, sv.description, sv.created_at
       ORDER BY sv.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return sendJSON(res, 200, {
      success: true,
      total: result.rowCount,
      limit,
      offset,
      data: result.rows,
    });
  }

  if (path === "/videos/search" && req.method === "GET") {
    if (query.q) {
      const result = await pool.query(
        `SELECT
           sv.id,
           sv.title,
           sv.description,
           sv.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'name',     t.name,
                 'tag_type', t.tag_type
               )
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) AS tags
         FROM short_videos sv
         JOIN content_tags ct ON sv.id = ct.content_id
         JOIN tags t ON ct.tag_id = t.id
         WHERE t.name ILIKE $1
         GROUP BY sv.id, sv.title, sv.description, sv.created_at
         ORDER BY sv.created_at DESC
         LIMIT $2 OFFSET $3`,
        [`%${query.q}%`, limit, offset]
      );

      return sendJSON(res, 200, {
        success: true,
        total: result.rowCount,
        limit,
        offset,
        filters: { q: query.q },
        data: result.rows,
      });
    }

    // filter by specific tag types (exam, subject, pyq etc.)
    const tagFilters: string[] = [];
    if (query.exam)       tagFilters.push(query.exam);
    if (query.pyq)        tagFilters.push(query.pyq);
    if (query.subject)    tagFilters.push(query.subject);
    if (query.topic)      tagFilters.push(query.topic);
    if (query.difficulty) tagFilters.push(query.difficulty);

    if (tagFilters.length > 0) {
      // AND logic — video must have ALL specified tags
      const joins = tagFilters.map((tagName, i) =>
        `JOIN content_tags ct${i} ON sv.id = ct${i}.content_id
         JOIN tags t${i} ON ct${i}.tag_id = t${i}.id AND t${i}.name = $${i + 1}`
      ).join("\n");

      const result = await pool.query(
        `SELECT
           sv.id,
           sv.title,
           sv.description,
           sv.created_at
         FROM short_videos sv
         ${joins}
         ORDER BY sv.created_at DESC
         LIMIT $${tagFilters.length + 1} OFFSET $${tagFilters.length + 2}`,
        [...tagFilters, limit, offset]
      );

      return sendJSON(res, 200, {
        success: true,
        total: result.rowCount,
        limit,
        offset,
        filters: query,
        data: result.rows,
      });
    }

    return sendJSON(res, 400, {
      success: false,
      message: "Provide at least one filter: q, exam, pyq, subject, topic, difficulty",
    });
  }


  const idMatch = path.match(/^\/videos\/([a-f0-9-]{36})$/);
  if (idMatch && req.method === "GET") {
    const result = await pool.query(
      `SELECT
         sv.id,
         sv.title,
         sv.description,
         sv.created_at,
         COALESCE(
           json_agg(
             json_build_object(
               'id',       t.id,
               'name',     t.name,
               'slug',     t.slug,
               'tag_type', t.tag_type
             )
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM short_videos sv
       LEFT JOIN content_tags ct ON sv.id = ct.content_id
       LEFT JOIN tags t ON ct.tag_id = t.id
       WHERE sv.id = $1
       GROUP BY sv.id, sv.title, sv.description, sv.created_at`,
      [idMatch[1]]
    );

    if (result.rowCount === 0) {
      return sendJSON(res, 404, { success: false, message: "Not found" });
    }

    return sendJSON(res, 200, {
      success: true,
      data: result.rows[0],
    });
  }

  if (path === "/tags" && req.method === "GET") {
    const result = await pool.query(
      `SELECT
         tag_type,
         json_agg(
           json_build_object('id', id, 'name', name, 'slug', slug)
           ORDER BY name
         ) AS tags
       FROM tags
       GROUP BY tag_type
       ORDER BY tag_type`
    );

    return sendJSON(res, 200, {
      success: true,
      data: result.rows,
    });
  }

  // ── 404 ──────────────────────────────────────────────────────────────────
  return sendJSON(res, 404, { success: false, message: "Route not found" });
}

const PORT = 3002;

const server = http.createServer(async (req, res) => {
  try {
    await handleRoutes(req, res);
  } catch (err) {
    console.error("Request error:", err);
    sendJSON(res, 500, { success: false, message: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Relational API running on http://localhost:${PORT}`);
  console.log(`\nRoutes:`);
  console.log(`  GET /health`);
  console.log(`  GET /videos?limit=10&offset=0`);
  console.log(`  GET /videos/search?q=ups              ← fuzzy search`);
  console.log(`  GET /videos/search?exam=upsc           ← exact exam filter`);
  console.log(`  GET /videos/search?exam=upsc&subject=history  ← combined`);
  console.log(`  GET /videos/:id                        ← single video with tags`);
  console.log(`  GET /tags                              ← all tags by type`);
});