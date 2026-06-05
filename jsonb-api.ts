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

  // ── GET /health ──────────────────────────────────────────────────────────
  if (path === "/health" && req.method === "GET") {
    return sendJSON(res, 200, { status: "ok", approach: "jsonb" });
  }


  if (path === "/documents" && req.method === "GET") {
    const result = await pool.query(
      `SELECT id, title, description, createdat, tags
       FROM documents
       ORDER BY createdat DESC
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


  if (path === "/documents/search" && req.method === "GET") {
    const conditions: string[] = [];
    const values: unknown[]    = [];
    let   idx = 1;

    if (query.exam) {
      conditions.push(`tags @> $${idx++}::jsonb`);
      values.push(JSON.stringify({ exam: [query.exam] }));
    }

    if (query.pyq) {
      conditions.push(`tags @> $${idx++}::jsonb`);
      values.push(JSON.stringify({ pyq: [query.pyq] }));
    }

    if (query.subject) {
      conditions.push(`tags @> $${idx++}::jsonb`);
      values.push(JSON.stringify({ subject: [query.subject] }));
    }

    if (query.topic) {
      conditions.push(`tags @> $${idx++}::jsonb`);
      values.push(JSON.stringify({ topic: [query.topic] }));
    }

    if (query.difficulty) {
      conditions.push(`tags @> $${idx++}::jsonb`);
      values.push(JSON.stringify({ difficulty: [query.difficulty] }));
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    values.push(limit, offset);

    const result = await pool.query(
      `SELECT id, title, description, createdat, tags
       FROM documents
       ${where}
       ORDER BY createdat DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
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

  const idMatch = path.match(/^\/documents\/([a-f0-9-]{36})$/);
  if (idMatch && req.method === "GET") {
    const result = await pool.query(
      `SELECT id, title, description, createdat, tags
       FROM documents
       WHERE id = $1`,
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

  return sendJSON(res, 404, { success: false, message: "Route not found" });
}


const PORT = 3001;

const server = http.createServer(async (req, res) => {
  try {
    await handleRoutes(req, res);
  } catch (err) {
    console.error("Request error:", err);
    sendJSON(res, 500, { success: false, message: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`JSONB API running on http://localhost:${PORT}`);
  console.log(`\nRoutes:`);
  console.log(`  GET /health`);
  console.log(`  GET /documents?limit=10&offset=0`);
  console.log(`  GET /documents/search?exam=upsc`);
  console.log(`  GET /documents/search?exam=upsc&pyq=upsc 2020`);
  console.log(`  GET /documents/search?exam=upsc&subject=history`);
  console.log(`  GET /documents/:id`);
});