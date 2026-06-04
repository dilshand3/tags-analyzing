import { Pool } from "pg";
import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

const DB_CONFIG = {
  host: "localhost",
  port: 5432,
  database: "tags-data",
  user: "postgres",
  password: "d3_priynka_jonas",
  max: 10,
};

const TOTAL_ROWS   = 3000000;   
const BATCH_SIZE   = 5_000;      
const LOG_INTERVAL = 100_000;


const EXAMS = [
  "upsc", "ssc", "ibps", "rrb", "neet",
  "jee",  "cat", "gate", "ctet", "nda",
  "cds",  "capf", "ias", "ips", "ifs",
] as const;

const PYQ_ENTRIES: string[] = [];
for (const exam of EXAMS) {
  for (let year = 2010; year <= 2024; year++) {
    PYQ_ENTRIES.push(`${exam} ${year}`);
  }
}

function pickRandom<T>(arr: readonly T[], k: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, k);
}

function buildTags(): { exam: string[]; pyq: string[] } {
  const examCount = faker.number.int({ min: 1, max: 4 });
  const pyqCount  = faker.number.int({ min: 1, max: 5 });

  const exam = pickRandom(EXAMS, examCount);
  const relevantPyq = PYQ_ENTRIES.filter((p) =>
    exam.some((e) => p.startsWith(e))
  );
  const pool = relevantPyq.length >= pyqCount ? relevantPyq : PYQ_ENTRIES;
  const pyq  = pickRandom(pool, Math.min(pyqCount, pool.length));

  return { exam, pyq };
}

function generateRow(): [string, string, string, string, string] {
  const id          = uuidv4();
  const title       = faker.lorem.sentence({ min: 4, max: 12 });
  const description = faker.lorem.paragraph({ min: 2, max: 5 });
  const createdat   = faker.date
    .between({ from: "2015-01-01", to: new Date() })
    .toISOString()
    .slice(0, 10);
  const tags = JSON.stringify(buildTags());

  return [id, title, description, createdat, tags];
}

async function insertBatch(
  client: import("pg").PoolClient,
  rows: [string, string, string, string, string][]
): Promise<void> {
  const values: string[] = [];
  const params: string[] = [];
  let   idx = 1;

  for (const row of rows) {
    params.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::jsonb)`);
    values.push(...row);
  }

  const sql = `
    INSERT INTO documents (id, title, description, createdat, tags)
    VALUES ${params.join(", ")}
    ON CONFLICT DO NOTHING
  `;

  await client.query(sql, values);
}


async function main() {
  const pool   = new Pool(DB_CONFIG);
  const client = await pool.connect();

  console.log(`Starting seed: ${TOTAL_ROWS.toLocaleString()} rows, batch size ${BATCH_SIZE}`);
  const start = Date.now();

  try {
    let inserted = 0;

    while (inserted < TOTAL_ROWS) {
      const thisBatch = Math.min(BATCH_SIZE, TOTAL_ROWS - inserted);
      const rows = Array.from({ length: thisBatch }, generateRow);

      await insertBatch(client, rows);
      inserted += thisBatch;

      if (inserted % LOG_INTERVAL === 0 || inserted === TOTAL_ROWS) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const rate    = Math.round(inserted / parseFloat(elapsed));
        console.log(
          `  ✓ ${inserted.toLocaleString()} / ${TOTAL_ROWS.toLocaleString()} rows` +
          `  (${elapsed}s elapsed, ~${rate.toLocaleString()} rows/s)`
        );
      }
    }

    const total = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone! ${TOTAL_ROWS.toLocaleString()} rows inserted in ${total}s.`);
  } catch (err) {
    console.error("Seed failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});