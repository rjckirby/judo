const filters = document.querySelector(".filters");
const query = document.querySelector("#query");
const year = document.querySelector("#year");
const includeUnplaced = document.querySelector("#include-unplaced");
const groupBy = document.querySelector("#group-by");
const tournamentView = groupBy.querySelector('[value="tournament"]');
const download = document.querySelector("#download");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const monthFormat = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const badgeMonthFormat = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function label(text, url) {
  const element = document.createElement(url ? "a" : "span");
  element.textContent = text;
  if (url) element.href = url;
  return element;
}

function tournamentTitle(result, category) {
  const title = document.createElement("span");
  title.className = "tournament-title";
  if (result.date) {
    const date = new Date(result.date);
    const badge = document.createElement("time");
    badge.className = "date-badge";
    badge.dateTime = result.date;
    badge.append(
      Object.assign(document.createElement("span"), { className: "sr", textContent: dayFormat.format(date) }),
      Object.assign(document.createElement("span"), { className: "date-day", ariaHidden: "true", textContent: date.getUTCDate() }),
      Object.assign(document.createElement("span"), {
        className: "date-month",
        ariaHidden: "true",
        textContent: `${badgeMonthFormat.format(date)} ’${result.date.slice(2, 4)}`,
      }),
    );
    title.append(badge);
  }
  const name = document.createElement("span");
  name.append(label(result.competition ?? "Tournament", result.competition_url));
  if (category) {
    name.append(Object.assign(document.createElement("small"), { className: "mobile-category", textContent: category }));
  }
  title.append(name);
  return title;
}

function matchingRows(rows) {
  const terms = normalize(query.value).trim().split(/\s+/).filter(Boolean);
  return rows.filter(row =>
    (!year.value || row.date.startsWith(year.value)) &&
    (includeUnplaced.checked || row.place != null) &&
    terms.every(term => row.search.includes(term))
  );
}

function celebrateKirby() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { left, top, width, height } = query.getBoundingClientRect();
  const burst = document.createElement("div");
  burst.className = "confetti";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${left + width / 2}px`;
  burst.style.top = `${top + height / 2}px`;
  document.body.append(burst);

  const colors = ["#cf230f", "#f0c24b", "#fff", "#11121d"];
  for (let index = 0; index < 24; index++) {
    const piece = burst.appendChild(document.createElement("span"));
    piece.style.backgroundColor = colors[index % colors.length];
    const spread = (Math.random() - .5) * Math.min(window.innerWidth, 420);
    const rise = 40 + Math.random() * 90;
    piece.animate([
      { transform: "translate(0, 0) rotate(0turn)" },
      { transform: `translate(${spread * .55}px, ${-rise}px) rotate(.45turn)`, offset: .4 },
      { transform: `translate(${spread}px, 145px) rotate(1.2turn)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 350, easing: "ease-out", fill: "forwards" });
  }
  setTimeout(() => burst.remove(), 1100);
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
  section.className = byTournament ? "result-group" : "result-group fighter-group";
  const id = byTournament ? `tournament-${first.competition_id}` : `fighter-${first.athleteId}`;
  const heading = document.createElement(byTournament ? "h3" : "h2");
  heading.id = id;
  heading.append(byTournament ? tournamentTitle(first) : label(first.name, first.profileUrl));
  section.append(heading);

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
    const category = [result.age_category, result.weight_category].filter(Boolean).join(" · ");
    subject.append(byTournament ? label(result.name, result.profileUrl) : tournamentTitle(result, category));
    const details = document.createElement("small");
    details.textContent = category;
    row.insertCell().append(details);
    row.insertCell().append(placement(result.place));
  }
  section.append(table);
  return section;
}

function render(matches) {
  const items = document.createDocumentFragment();
  if (tournamentView.checked) {
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
    fighters.sort(([a], [b]) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
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
  const lines = [["Tournament", "Date", "Age category", "Weight category", "Fighter", "Place"]];
  for (const tournament of groupRows(rows, row => row.competition_id).values()) {
    for (const row of tournament) {
      lines.push([row.competition, row.date, row.age_category, row.weight_category, row.name, row.place]);
    }
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
    tournamentView.checked = true;
    query.disabled = false;
    year.disabled = false;
    includeUnplaced.disabled = false;
    groupBy.disabled = false;
    const update = () => render(matchingRows(rows));
    filters.addEventListener("input", update);
    groupBy.addEventListener("input", update);
    let kirbyCelebrated = false;
    query.addEventListener("input", () => {
      if (!/\bkirby\b/.test(normalize(query.value))) {
        kirbyCelebrated = false;
      } else if (!kirbyCelebrated && matchingRows(rows).some(row => /\bkirby\b/.test(normalize(row.name)))) {
        kirbyCelebrated = true;
        celebrateKirby();
      }
    });
    download.addEventListener("click", () => downloadTsv(matchingRows(rows)));
    update();
  } catch (error) {
    console.error(error);
    status.textContent = "Couldn’t load results. Reload the page to try again.";
  }
}

filters.addEventListener("submit", event => event.preventDefault());
load();
