const filters = document.querySelector(".filters");
const query = document.querySelector("#query");
const year = document.querySelector("#year");
const includeUnplaced = document.querySelector("#include-unplaced");
const download = document.querySelector("#download");
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

function matchingRows(rows) {
  const terms = normalize(query.value).trim().split(/\s+/).filter(Boolean);
  return rows.filter(row =>
    (!year.value || row.date.startsWith(year.value)) &&
    (includeUnplaced.checked || row.place != null) &&
    terms.every(term => row.search.includes(term))
  );
}

function render(matches) {
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
  download.disabled = matches.length === 0;
  if (matches.length) {
    const fighters = new Set(matches.map(row => row.athleteId)).size;
    status.textContent = `${matches.length} ${matches.length === 1 ? "result" : "results"} from ${fighters} ${fighters === 1 ? "fighter" : "fighters"}`;
  } else {
    status.textContent = "No results match these filters.";
  }
}

function tsvCell(value) {
  const text = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
  const safeWeight = /^-\d+(?:[.,]\d+)?(?:\s*kg)?$/i.test(text);
  return /^[=+\-@]/.test(text) && !safeWeight ? "'" + text : text;
}

function downloadTsv(rows) {
  const lines = [["Fighter", "Tournament", "Date", "Age category", "Weight category", "Place"]];
  for (const row of rows) {
    lines.push([row.name, row.competition, row.date, row.age_category, row.weight_category, row.place]);
  }
  const tsv = lines.map(line => line.map(tsvCell).join("\t")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", tsv, "\r\n"], {
    type: "text/tab-separated-values;charset=utf-8",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `jjcb-results-${year.value || "all-years"}.tsv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    const currentYear = String(new Date().getFullYear());
    const years = new Set([currentYear, ...rows.map(row => row.date.slice(0, 4)).filter(Boolean)]);
    for (const value of [...years].sort((a, b) => b.localeCompare(a))) {
      year.add(new Option(value, value));
    }
    year.value = currentYear;
    includeUnplaced.checked = false;
    query.disabled = false;
    year.disabled = false;
    includeUnplaced.disabled = false;
    const update = () => render(matchingRows(rows));
    filters.addEventListener("input", update);
    download.addEventListener("click", () => downloadTsv(matchingRows(rows)));
    update();
  } catch (error) {
    console.error(error);
    status.textContent = "Couldn’t load results. Reload the page to try again.";
  }
}

filters.addEventListener("submit", event => event.preventDefault());
load();
