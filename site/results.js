const filters = document.querySelector(".filters");
const query = document.querySelector("#query");
const year = document.querySelector("#year");
const status = document.querySelector("#status");
const table = document.querySelector("#results");
const body = table.tBodies[0];

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function label(text, url) {
  const element = document.createElement(url ? "a" : "span");
  element.textContent = text;
  if (url) element.href = url;
  return element;
}

function render(rows) {
  const terms = normalize(query.value).trim().split(/\s+/).filter(Boolean);
  const matches = rows.filter(row =>
    (!year.value || row.date.startsWith(year.value)) &&
    terms.every(term => row.search.includes(term))
  );
  const items = document.createDocumentFragment();
  for (const result of matches) {
    const row = items.appendChild(document.createElement("tr"));
    row.insertCell().append(label(result.name, result.profileUrl));
    const event = row.insertCell();
    event.append(label(result.competition ?? "Tournament", result.competition_url));
    const details = document.createElement("small");
    details.textContent = [result.date, result.age_category, result.weight_category].filter(Boolean).join(" · ");
    event.append(details);
    const place = row.insertCell();
    place.textContent = result.place ?? "–";
    place.classList.toggle("podium", [1, 2, 3].includes(result.place));
  }
  body.replaceChildren(items);
  table.hidden = matches.length === 0;
  if (matches.length) {
    const fighters = new Set(matches.map(row => row.athleteId)).size;
    status.textContent = `${matches.length} ${matches.length === 1 ? "result" : "results"} from ${fighters} ${fighters === 1 ? "fighter" : "fighters"}`;
  } else {
    status.textContent = "No results match these filters.";
  }
}

async function load() {
  try {
    const response = await fetch("./jjcb-results.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = data.athletes.flatMap(athlete => athlete.results.map(result => ({
      ...result,
      athleteId: athlete.athlete_id,
      name: athlete.name,
      profileUrl: athlete.profile_url,
      search: normalize(`${athlete.name} ${result.competition ?? ""}`),
    })));
    rows.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    const years = new Set(rows.map(row => row.date.slice(0, 4)).filter(Boolean));
    for (const value of years) year.add(new Option(value, value));
    query.disabled = false;
    year.disabled = false;
    query.addEventListener("input", () => render(rows));
    year.addEventListener("change", () => render(rows));
    render(rows);
  } catch (error) {
    console.error(error);
    status.textContent = "Couldn’t load results. Reload the page to try again.";
  }
}

filters.addEventListener("submit", event => event.preventDefault());
load();
