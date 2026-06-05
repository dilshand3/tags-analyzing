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

const TOTAL_VIDEOS  = 500_000;
const BATCH_SIZE    = 2_000;
const LOG_INTERVAL  = 50_000;


const TAG_DATA: { name: string; slug: string; tag_type: string }[] = [
  { name: "upsc",  slug: "upsc",  tag_type: "exam" },
  { name: "ssc",   slug: "ssc",   tag_type: "exam" },
  { name: "ibps",  slug: "ibps",  tag_type: "exam" },
  { name: "rrb",   slug: "rrb",   tag_type: "exam" },
  { name: "neet",  slug: "neet",  tag_type: "exam" },
  { name: "jee",   slug: "jee",   tag_type: "exam" },
  { name: "cat",   slug: "cat",   tag_type: "exam" },
  { name: "gate",  slug: "gate",  tag_type: "exam" },
  { name: "ctet",  slug: "ctet",  tag_type: "exam" },
  { name: "nda",   slug: "nda",   tag_type: "exam" },
  { name: "cds",   slug: "cds",   tag_type: "exam" },
  { name: "capf",  slug: "capf",  tag_type: "exam" },
  ...["upsc", "ssc", "ibps", "neet", "jee", "gate"].flatMap((exam) =>
    [2019, 2020, 2021, 2022, 2023, 2024].map((year) => ({
      name: `${exam} ${year}`,
      slug: `${exam}-${year}`,
      tag_type: "pyq",
    }))
  ),

  { name: "history",         slug: "history",         tag_type: "subject" },
  { name: "geography",       slug: "geography",       tag_type: "subject" },
  { name: "polity",          slug: "polity",          tag_type: "subject" },
  { name: "economy",         slug: "economy",         tag_type: "subject" },
  { name: "science",         slug: "science",         tag_type: "subject" },
  { name: "environment",     slug: "environment",     tag_type: "subject" },
  { name: "current affairs", slug: "current-affairs", tag_type: "subject" },
  { name: "mathematics",     slug: "mathematics",     tag_type: "subject" },

  { name: "mughal invasion",       slug: "mughal-invasion",       tag_type: "topic" },
  { name: "medieval india",        slug: "medieval-india",        tag_type: "topic" },
  { name: "delhi sultanate",       slug: "delhi-sultanate",       tag_type: "topic" },
  { name: "indian constitution",   slug: "indian-constitution",   tag_type: "topic" },
  { name: "fundamental rights",    slug: "fundamental-rights",    tag_type: "topic" },
  { name: "monetary policy",       slug: "monetary-policy",       tag_type: "topic" },
  { name: "climate change",        slug: "climate-change",        tag_type: "topic" },
  { name: "biodiversity",          slug: "biodiversity",          tag_type: "topic" },
  { name: "laws of motion",        slug: "laws-of-motion",        tag_type: "topic" },

  // difficulty
  { name: "easy",   slug: "easy",   tag_type: "difficulty" },
  { name: "medium", slug: "medium", tag_type: "difficulty" },
  { name: "hard",   slug: "hard",   tag_type: "difficulty" },
];

function pickRandom<T>(arr: T[], k: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, k);
}

async function seedTags(
  client: import("pg").PoolClient
): Promise<Map<string, string>> {
  console.log(`Inserting ${TAG_DATA.length} tags...`);

  const tagIdMap = new Map<string, string>(); // name → id

  for (const tag of TAG_DATA) {
    const id = uuidv4();
    await client.query(
      `INSERT INTO tags (id, name, slug, tag_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [id, tag.name, tag.slug, tag.tag_type]
    );

    const result = await client.query(
      `SELECT id FROM tags WHERE slug = $1`,
      [tag.slug]
    );
    tagIdMap.set(tag.name, result.rows[0].id);
  }

  console.log(`✓ ${tagIdMap.size} tags inserted\n`);
  return tagIdMap;
}


async function seedVideos(
  client: import("pg").PoolClient,
  tagIdMap: Map<string, string>
) {
  const allTagNames  = [...tagIdMap.keys()];
  const examTags     = allTagNames.filter((n) => TAG_DATA.find((t) => t.name === n && t.tag_type === "exam"));
  const pyqTags      = allTagNames.filter((n) => TAG_DATA.find((t) => t.name === n && t.tag_type === "pyq"));
  const subjectTags  = allTagNames.filter((n) => TAG_DATA.find((t) => t.name === n && t.tag_type === "subject"));
  const topicTags    = allTagNames.filter((n) => TAG_DATA.find((t) => t.name === n && t.tag_type === "topic"));
  const diffTags     = allTagNames.filter((n) => TAG_DATA.find((t) => t.name === n && t.tag_type === "difficulty"));

  console.log(`Inserting ${TOTAL_VIDEOS.toLocaleString()} short_videos with 10-12 tags each...`);
  const start = Date.now();
  let inserted = 0;

  while (inserted < TOTAL_VIDEOS) {
    const thisBatch = Math.min(BATCH_SIZE, TOTAL_VIDEOS - inserted);

    // ── build video rows ──
    const videoParams: string[] = [];
    const videoValues: string[] = [];
    const videoIds: string[]    = [];
    let idx = 1;

    for (let i = 0; i < thisBatch; i++) {
      const id          = uuidv4();
      const title       = faker.lorem.sentence({ min: 4, max: 12 });
      const description = faker.lorem.paragraph({ min: 2, max: 5 });
      const created_at  = faker.date
        .between({ from: "2015-01-01", to: new Date() })
        .toISOString()
        .slice(0, 10);

      videoIds.push(id);
      videoParams.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      videoValues.push(id, title, description, created_at);
    }

    // insert videos
    await client.query(
      `INSERT INTO short_videos (id, title, description, created_at)
       VALUES ${videoParams.join(", ")}
       ON CONFLICT DO NOTHING`,
      videoValues
    );

    // ── build content_tags rows ──
    // each video gets 10-12 tags
    const ctParams: string[] = [];
    const ctValues: string[] = [];
    let ctIdx = 1;

    for (const videoId of videoIds) {
      // pick tags from each type to ensure 10-12 total
      const selectedExams    = pickRandom(examTags,    faker.number.int({ min: 1, max: 3 }));
      const selectedPyq      = pickRandom(pyqTags,     faker.number.int({ min: 2, max: 4 }));
      const selectedSubjects = pickRandom(subjectTags, faker.number.int({ min: 1, max: 2 }));
      const selectedTopics   = pickRandom(topicTags,   faker.number.int({ min: 2, max: 3 }));
      const selectedDiff     = pickRandom(diffTags,    1);

      const selectedTags = [
        ...selectedExams,
        ...selectedPyq,
        ...selectedSubjects,
        ...selectedTopics,
        ...selectedDiff,
      ];

      for (const tagName of selectedTags) {
        const tagId = tagIdMap.get(tagName)!;
        ctParams.push(`($${ctIdx++}, $${ctIdx++})`);
        ctValues.push(videoId, tagId);
      }
    }

    // insert content_tags
    await client.query(
      `INSERT INTO content_tags (content_id, tag_id)
       VALUES ${ctParams.join(", ")}
       ON CONFLICT DO NOTHING`,
      ctValues
    );

    inserted += thisBatch;

    if (inserted % LOG_INTERVAL === 0 || inserted === TOTAL_VIDEOS) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const rate    = Math.round(inserted / parseFloat(elapsed));
      console.log(
        `  ✓ ${inserted.toLocaleString()} / ${TOTAL_VIDEOS.toLocaleString()} videos` +
        `  (${elapsed}s elapsed, ~${rate.toLocaleString()} videos/s)`
      );
    }
  }

  const total = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone! ${TOTAL_VIDEOS.toLocaleString()} videos inserted in ${total}s.`);

  // total content_tags rows
  const ctCount = await client.query(`SELECT COUNT(*) FROM content_tags`);
  console.log(`Total content_tags rows: ${parseInt(ctCount.rows[0].count).toLocaleString()}`);
}


async function main() {
  const pool   = new Pool(DB_CONFIG);
  const client = await pool.connect();

  try {
    const tagIdMap = await seedTags(client);
    await seedVideos(client, tagIdMap);
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