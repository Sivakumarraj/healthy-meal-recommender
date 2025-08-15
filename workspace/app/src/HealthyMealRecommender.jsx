import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

// === Healthy Meal Recommender ===
// Paste menu data, set hunger level, budget, and calorie goal.
// The app will analyze items and suggest three optimized healthy meal combos.
// Works entirely client-side (no API key required).

// ---- Helpers ----
function isNumber(n) {
  return typeof n === "number" && !Number.isNaN(n);
}

function parseMenu(text) {
  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return sanitizeItems(parsed);
  } catch (e) {
    // fall through to CSV/TSV lines
  }

  // CSV/TSV format: name,price,calories,protein,fiber,sugar,satFat,sodium,tags
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^#/.test(l));

  const out = [];
  for (const line of lines) {
    const parts = line.split(/[\t,]/).map((p) => p.trim());
    if (parts.length < 3) continue;
    const [name, priceStr, calStr, proteinStr, fiberStr, sugarStr, satFatStr, sodiumStr, tagsStr] = parts;
    const item = {
      name,
      price: Number(priceStr),
      calories: Number(calStr),
      protein: Number(proteinStr || 0),
      fiber: Number(fiberStr || 0),
      sugar: Number(sugarStr || 0),
      satFat: Number(satFatStr || 0),
      sodium: Number(sodiumStr || 0),
      tags: tagsStr ? tagsStr.split("|").map((t) => t.trim().toLowerCase()) : [],
    };
    out.push(item);
  }
  return sanitizeItems(out);
}

function sanitizeItems(items) {
  return items
    .map((it) => ({
      name: String(it.name || "Unnamed"),
      price: Number(it.price || 0),
      calories: Number(it.calories || 0),
      protein: Number(it.protein || 0),
      fiber: Number(it.fiber || 0),
      sugar: Number(it.sugar || 0),
      satFat: Number(it.satFat || 0),
      sodium: Number(it.sodium || 0),
      tags: Array.isArray(it.tags)
        ? it.tags.map((t) => String(t).toLowerCase())
        : (String(it.tags || "")
            .split("|")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)),
    }))
    .filter((it) => it.name && isFinite(it.price) && isFinite(it.calories));
}

function comboSum(combo) {
  return combo.reduce(
    (acc, it) => ({
      names: [...acc.names, it.name],
      price: acc.price + it.price,
      calories: acc.calories + it.calories,
      protein: acc.protein + it.protein,
      fiber: acc.fiber + it.fiber,
      sugar: acc.sugar + it.sugar,
      satFat: acc.satFat + it.satFat,
      sodium: acc.sodium + it.sodium,
      tags: Array.from(new Set([...acc.tags, ...it.tags])),
    }),
    {
      names: [],
      price: 0,
      calories: 0,
      protein: 0,
      fiber: 0,
      sugar: 0,
      satFat: 0,
      sodium: 0,
      tags: [],
    }
  );
}

function healthScore(totals, targets) {
  // Scoring: higher is better (0..100 range typical)
  // Reward protein & fiber, penalize sugar, sat fat, sodium, and deviation from calorie goal.
  const { priceTarget, calorieTarget } = targets;

  const proteinScore = Math.min(totals.protein / 30, 1) * 20; // up to 30g -> 20 pts
  const fiberScore = Math.min(totals.fiber / 10, 1) * 15; // up to 10g -> 15 pts
  const sugarPenalty = Math.min(totals.sugar / 25, 1) * 15; // 25g sugar -> -15
  const satFatPenalty = Math.min(totals.satFat / 20, 1) * 10; // 20g sat fat -> -10
  const sodiumPenalty = Math.min(totals.sodium / 2000, 1) * 10; // 2g sodium -> -10

  const calDiff = Math.abs(totals.calories - calorieTarget);
  const calPenalty = Math.min(calDiff / 300, 1) * 20; // 300 kcal off -> -20

  const pricePenalty = totals.price > priceTarget ? Math.min((totals.price - priceTarget) / Math.max(priceTarget, 1), 1) * 10 : 0;

  let score = 50 + proteinScore + fiberScore - sugarPenalty - satFatPenalty - sodiumPenalty - calPenalty - pricePenalty;
  score = Math.max(0, Math.min(100, score));
  return score;
}

function pickTopCombos(items, { calorieGoal, hungerLevel, budget, maxComboSize = 2 }) {
  if (!items.length) return [];

  // Adjust calorie target based on hunger (0..10) => 60%..140% of goal
  const calorieTarget = Math.round(calorieGoal * (0.6 + (hungerLevel / 10) * 0.8));
  const priceTarget = budget;

  // generate combos up to size N (1..maxComboSize)
  const combos = [];

  // size 1
  for (let i = 0; i < items.length; i++) combos.push([items[i]]);
  // size 2
  if (maxComboSize >= 2) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) combos.push([items[i], items[j]]);
    }
  }

  const scored = combos.map((combo) => {
    const t = comboSum(combo);
    const score = healthScore(t, { calorieTarget, priceTarget });
    return { combo, totals: t, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // pick top 3 diverse (avoid near-duplicate name sets)
  const picks = [];
  for (const s of scored) {
    const key = s.totals.names.sort().join("|");
    if (!picks.some((p) => p.key === key)) {
      picks.push({ ...s, key });
    }
    if (picks.length === 3) break;
  }
  return picks;
}

const SAMPLE_MENU = `# name,price,calories,protein,fiber,sugar,satFat,sodium,tags
Grilled Chicken Salad,7.99,420,32,6,5,3,620,gluten-free|high-protein
Quinoa Veg Bowl,6.49,480,18,9,7,2,540,vegan|high-fiber
Turkey Wrap,6.99,520,28,5,4,5,780,high-protein
Lentil Soup,4.99,320,16,8,4,1,480,vegan|gluten-free
Veggie Omelette,5.49,380,22,3,3,6,520,vegetarian
Greek Yogurt Parfait,3.99,220,17,2,12,3,120,vegetarian
Fruit Cup,2.49,120,2,3,20,0,5,vegan|gluten-free
Brown Rice,2.99,200,4,2,0,0,0,vegan|gluten-free
Baked Salmon,8.99,460,35,2,1,6,540,gluten-free|high-protein`;

export default function HealthyMealRecommender() {
  const [menuRaw, setMenuRaw] = useState(SAMPLE_MENU);
  const [budget, setBudget] = useState(12);
  const [calorieGoal, setCalorieGoal] = useState(600);
  const [hunger, setHunger] = useState(5); // 0..10
  const [maxComboSize, setMaxComboSize] = useState(2);
  const [dietFilter, setDietFilter] = useState("any"); // any | vegan | vegetarian | gluten-free

  const itemsAll = useMemo(() => parseMenu(menuRaw), [menuRaw]);
  const items = useMemo(() => {
    if (dietFilter === "any") return itemsAll;
    return itemsAll.filter((it) => it.tags?.includes(dietFilter));
  }, [itemsAll, dietFilter]);

  const picks = useMemo(
    () =>
      pickTopCombos(items, {
        calorieGoal: Number(calorieGoal) || 600,
        hungerLevel: Number(hunger) || 5,
        budget: Number(budget) || 10,
        maxComboSize: Number(maxComboSize) || 2,
      }),
    [items, calorieGoal, hunger, budget, maxComboSize]
  );

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold tracking-tight"
        >
          Healthy Meal Recommender
        </motion.h1>
        <p className="mt-2 text-sm text-gray-600">
          Paste a menu (JSON array or CSV lines), set your targets, and get three optimized healthy combos. The app
          considers protein, fiber, sugar, saturated fat, sodium, calories vs goal, and budget fit.
        </p>

        {/* Controls */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <label className="text-sm font-medium">Menu Data</label>
            <textarea
              value={menuRaw}
              onChange={(e) => setMenuRaw(e.target.value)}
              className="mt-2 h-64 w-full resize-y rounded-2xl border border-gray-300 p-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10"
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-gray-500">
              CSV format: <code>name,price,calories,protein,fiber,sugar,satFat,sodium,tags</code> (tags separated by
              <code>|</code>). JSON format: array of items with those keys.
            </p>
          </div>

          <div className="md:col-span-2">
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-gray-200 p-4 shadow-sm bg-white">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Budget ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-24 rounded-lg border border-gray-300 p-1 text-right"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="text-sm font-medium">Calorie Goal</label>
                  <input
                    type="number"
                    min={200}
                    step={50}
                    value={calorieGoal}
                    onChange={(e) => setCalorieGoal(e.target.value)}
                    className="w-24 rounded-lg border border-gray-300 p-1 text-right"
                  />
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium">Hunger Level: {hunger}</label>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={hunger}
                    onChange={(e) => setHunger(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                  <p className="mt-1 text-xs text-gray-500">Adjusts target calories (60% to 140% of goal).</p>
                </div>
                <div className="mt-3">
                  <label className="text-sm font-medium">Max Combo Size</label>
                  <select
                    value={maxComboSize}
                    onChange={(e) => setMaxComboSize(Number(e.target.value))}
                    className="ml-2 rounded-lg border border-gray-300 p-1"
                  >
                    <option value={1}>1 item</option>
                    <option value={2}>2 items</option>
                  </select>
                </div>
                <div className="mt-3">
                  <label className="text-sm font-medium">Dietary Filter</label>
                  <select
                    value={dietFilter}
                    onChange={(e) => setDietFilter(e.target.value)}
                    className="ml-2 rounded-lg border border-gray-300 p-1"
                  >
                    <option value="any">Any</option>
                    <option value="vegan">Vegan</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="gluten-free">Gluten-free</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold">Tips</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-600 space-y-1">
                  <li>Add <code>high-protein</code> or <code>high-fiber</code> tags to boost ranking.</li>
                  <li>Keep sugar, saturated fat, and sodium low for higher scores.</li>
                  <li>Use JSON if your menu already has nutrition fields.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <h2 className="text-2xl font-semibold">Top 3 Healthy Combos</h2>
          {picks.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No valid items found. Check your menu format.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {picks.map((pick, idx) => (
                <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold">Combo #{idx + 1}</h3>
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100">Score {pick.score.toFixed(0)}</span>
                  </div>
                  <ul className="mt-2 text-sm text-gray-800 list-disc pl-5">
                    {pick.totals.names.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <Stat label="Total Cost" value={`$${pick.totals.price.toFixed(2)}`} />
                    <Stat label="Calories" value={`${pick.totals.calories} kcal`} />
                    <Stat label="Protein" value={`${pick.totals.protein} g`} />
                    <Stat label="Fiber" value={`${pick.totals.fiber} g`} />
                    <Stat label="Sugar" value={`${pick.totals.sugar} g`} />
                    <Stat label="Sat Fat" value={`${pick.totals.satFat} g`} />
                    <Stat label="Sodium" value={`${pick.totals.sodium} mg`} />
                  </div>

                  <div className="mt-3 text-xs text-gray-600">
                    {pick.totals.tags.length > 0 && (
                      <p>
                        Tags: {pick.totals.tags.map((t) => (
                          <span key={t} className="mr-1 inline-block rounded-md bg-gray-100 px-2 py-0.5">
                            {t}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Debug Table */}
        <div className="mt-10">
          <details>
            <summary className="cursor-pointer select-none text-sm text-gray-600">Show parsed items</summary>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-700">
                    {["Name","Price","Calories","Protein","Fiber","Sugar","SatFat","Sodium","Tags"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2">${it.price.toFixed(2)}</td>
                      <td className="px-3 py-2">{it.calories}</td>
                      <td className="px-3 py-2">{it.protein}</td>
                      <td className="px-3 py-2">{it.fiber}</td>
                      <td className="px-3 py-2">{it.sugar}</td>
                      <td className="px-3 py-2">{it.satFat}</td>
                      <td className="px-3 py-2">{it.sodium}</td>
                      <td className="px-3 py-2">{it.tags?.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <footer className="mt-10 text-center text-xs text-gray-500">
          Built in Canvas • No external APIs • Customize the scoring logic to your taste
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}