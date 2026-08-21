const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!baseUrl || !publishableKey) {
  console.error("Hosted schema check requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const requiredTables = ["destinations", "plan_items", "ideas"];
const failures = [];

for (const table of requiredTables) {
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id&limit=0`, {
    headers: { apikey: publishableKey },
  });
  const body = await response.text();
  if (response.status === 404 || body.includes("PGRST205")) failures.push(table);
}

if (failures.length) {
  console.error(`Hosted Supabase is missing required Gate 4 schema: ${failures.join(", ")}. Apply migrations before preview QA.`);
  process.exit(1);
}

console.log("Hosted Supabase Gate 4 schema is present. Preview QA may begin.");
