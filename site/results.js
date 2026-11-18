const filters = document.querySelector(".filters");
const query = document.querySelector("#query");
const year = document.querySelector("#year");
const includeUnplaced = document.querySelector("#include-unplaced");
const groupBy = document.querySelector("#group-by");
const grouping = filters.elements.group;
const download = document.querySelector("#download");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const monthFormat = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

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

function groupRows(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

function placement(value) {
  const chip = document.createElement("span");
  chip.className = "place";
  if (value == null) {
    chip.classList.add("unplaced");
    chip.append(Object.assign(document.createElement("span"), { ariaHidden: "true", textContent: "–" }));
    chip.append(Object.assign(document.createElement("span"), { className: "sr", textContent: "No placement" }));
  } else {
    if ([1, 2, 3].includes(value)) chip.classList.add(`place-${value}`);
    chip.textContent = value;
  }
  return chip;
}

function resultGroup(rows, byTournament) {
  const first = rows[0];
  const section = document.createElement("section");
  section.className = "result-group";
  const title = byTournament ? first.competition ?? "Tournament" : first.name;
  const id = byTournament ? `tournament-${first.competition_id}` : `fighter-${first.athleteId}`;
  const heading = document.createElement(byTournament ? "h3" : "h2");
  heading.id = id;
  heading.append(label(title, byTournament ? first.competition_url : first.profileUrl));
  section.append(heading);
  if (byTournament && first.date) {
    const date = document.createElement("time");
    date.dateTime = first.date;
    date.textContent = dayFormat.format(new Date(first.date));
    section.append(date);
  }

  const table = document.createElement("table");
  table.setAttribute("aria-labelledby", id);
  const headers = table.createTHead().insertRow();
  for (const title of [byTournament ? "Fighter" : "Tournament", "Category", "Place"]) {
    const head = document.createElement("th");
    head.scope = "col";
    head.textContent = title;
    headers.append(head);
  }

  const body = table.createTBody();
  for (const result of rows) {
    const row = body.insertRow();
    const subject = row.insertCell();
    subject.append(byTournament ? label(result.name, result.profileUrl) :
      label(result.competition ?? "Tournament", result.competition_url));
    if (!byTournament && result.date) {
      const date = document.createElement("time");
      date.dateTime = result.date;
      date.textContent = dayFormat.format(new Date(result.date));
      subject.append(date);
    }
    const details = document.createElement("small");
    details.textContent = [result.age_category, result.weight_category].filter(Boolean).join(" · ");
    row.insertCell().append(details);
    row.insertCell().append(placement(result.place));
  }
  section.append(table);
  return section;
}

function render(matches) {
  const items = document.createDocumentFragment();
  if (grouping.value === "tournament") {
    for (const [month, rows] of groupRows(matches, row => row.date.slice(0, 7))) {
      const monthSection = items.appendChild(document.createElement("section"));
      monthSection.className = "result-month";
      const heading = monthSection.appendChild(document.createElement("h2"));
      heading.textContent = month ? monthFormat.format(new Date(`${month}-01`)) : "Date unavailable";
      for (const tournament of groupRows(rows, row => row.competition_id).values()) {
        monthSection.append(resultGroup(tournament, true));
      }
    }
  } else {
    const fighters = [...groupRows(matches, row => row.athleteId).values()];
    fighters.sort(([a], [b]) => a.name.localeCompare(b.name));
    for (const fighter of fighters) items.append(resultGroup(fighter, false));
  }
  results.replaceChildren(items);
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
    rows.sort((a, b) => b.date.localeCompare(a.date) ||
      (a.competition ?? "").localeCompare(b.competition ?? "") || a.name.localeCompare(b.name));
    const currentYear = String(new Date().getFullYear());
    const years = new Set([currentYear, ...rows.map(row => row.date.slice(0, 4)).filter(Boolean)]);
    for (const value of [...years].sort((a, b) => b.localeCompare(a))) {
      year.add(new Option(value, value));
    }
    year.value = currentYear;
    includeUnplaced.checked = false;
    grouping.value = "tournament";
    query.disabled = false;
    year.disabled = false;
    includeUnplaced.disabled = false;
    groupBy.disabled = false;
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
