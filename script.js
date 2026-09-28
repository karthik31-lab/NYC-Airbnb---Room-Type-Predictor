/* ---------------------------------------------------------
   Room Call — frontend logic
--------------------------------------------------------- */
(() => {
  "use strict";

  /* ---- Reference data ------------------------------------------------ */

  // Order must match the trained model's classes_ (RandomForest predict_proba
  // returns probabilities in this order).
  const CLASS_ORDER = ["Entire home/apt", "Private room", "Shared room"];

  const CLASS_META = {
    "Entire home/apt": {
      color: "var(--green)",
      soft: "var(--green-soft)",
      desc: "The whole place, to yourself — no shared walls with a host.",
    },
    "Private room": {
      color: "var(--amber)",
      soft: "var(--amber-soft)",
      desc: "A private room inside a home the host is also using.",
    },
    "Shared room": {
      color: "var(--red)",
      soft: "var(--red-soft)",
      desc: "A shared space — you may share the room itself with others.",
    },
  };

  const BOROUGH_CENTROIDS = {
    Manhattan: { lat: 40.7831, lon: -73.9712 },
    Brooklyn: { lat: 40.6782, lon: -73.9442 },
    Queens: { lat: 40.7282, lon: -73.7949 },
    Bronx: { lat: 40.8448, lon: -73.8648 },
    "Staten Island": { lat: 40.5795, lon: -74.1502 },
  };

  const NEIGHBOURHOODS = ["Allerton","Arden Heights","Arrochar","Arverne","Astoria","Bath Beach","Battery Park City","Bay Ridge","Bay Terrace","Bay Terrace, Staten Island","Baychester","Bayside","Bayswater","Bedford-Stuyvesant","Belle Harbor","Bellerose","Belmont","Bensonhurst","Bergen Beach","Boerum Hill","Borough Park","Breezy Point","Briarwood","Brighton Beach","Bronxdale","Brooklyn Heights","Brownsville","Bull's Head","Bushwick","Cambria Heights","Canarsie","Carroll Gardens","Castle Hill","Castleton Corners","Chelsea","Chinatown","City Island","Civic Center","Claremont Village","Clason Point","Clifton","Clinton Hill","Co-op City","Cobble Hill","College Point","Columbia St","Concord","Concourse","Concourse Village","Coney Island","Corona","Crown Heights","Cypress Hills","DUMBO","Ditmars Steinway","Dongan Hills","Douglaston","Downtown Brooklyn","Dyker Heights","East Elmhurst","East Flatbush","East Harlem","East Morrisania","East New York","East Village","Eastchester","Edenwald","Edgemere","Elmhurst","Eltingville","Emerson Hill","Far Rockaway","Fieldston","Financial District","Flatbush","Flatiron District","Flatlands","Flushing","Fordham","Forest Hills","Fort Greene","Fort Hamilton","Fresh Meadows","Glendale","Gowanus","Gramercy","Graniteville","Grant City","Gravesend","Great Kills","Greenpoint","Greenwich Village","Grymes Hill","Harlem","Hell's Kitchen","Highbridge","Hollis","Holliswood","Howard Beach","Howland Hook","Huguenot","Hunts Point","Inwood","Jackson Heights","Jamaica","Jamaica Estates","Jamaica Hills","Kensington","Kew Gardens","Kew Gardens Hills","Kingsbridge","Kips Bay","Laurelton","Little Italy","Little Neck","Long Island City","Longwood","Lower East Side","Manhattan Beach","Marble Hill","Mariners Harbor","Maspeth","Melrose","Middle Village","Midland Beach","Midtown","Midwood","Mill Basin","Morningside Heights","Morris Heights","Morris Park","Morrisania","Mott Haven","Mount Eden","Mount Hope","Murray Hill","Navy Yard","Neponsit","New Brighton","New Dorp","New Dorp Beach","New Springville","NoHo","Nolita","North Riverdale","Norwood","Oakwood","Olinville","Ozone Park","Park Slope","Parkchester","Pelham Bay","Pelham Gardens","Port Morris","Port Richmond","Prince's Bay","Prospect Heights","Prospect-Lefferts Gardens","Queens Village","Randall Manor","Red Hook","Rego Park","Richmond Hill","Ridgewood","Riverdale","Rockaway Beach","Roosevelt Island","Rosebank","Rosedale","Rossville","Schuylerville","Sea Gate","Sheepshead Bay","Shore Acres","Silver Lake","SoHo","Soundview","South Beach","South Ozone Park","South Slope","Springfield Gardens","Spuyten Duyvil","St. Albans","St. George","Stapleton","Stuyvesant Town","Sunnyside","Sunset Park","Theater District","Throgs Neck","Todt Hill","Tompkinsville","Tottenville","Tremont","Tribeca","Two Bridges","Unionport","University Heights","Upper East Side","Upper West Side","Van Nest","Vinegar Hill","Wakefield","Washington Heights","West Brighton","West Farms","West Village","Westchester Square","Westerleigh","Whitestone","Williamsbridge","Williamsburg","Willowbrook","Windsor Terrace","Woodhaven","Woodlawn","Woodside"];

  // Schematic connections between boroughs (visual only, not geographic).
  const CONNECTIONS = [
    ["Bronx", "Manhattan"],
    ["Manhattan", "Queens"],
    ["Manhattan", "Brooklyn"],
    ["Queens", "Brooklyn"],
    ["Manhattan", "Staten Island", true], // dashed — the ferry route
  ];

  /* ---- Elements -------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  const form = $("predictForm");
  const apiBaseInput = $("apiBase");
  const apiStatus = $("apiStatus");
  const neighbourhoodList = $("neighbourhoodList");
  const boroughSelect = $("neighbourhood_group");
  const latInput = $("latitude");
  const lonInput = $("longitude");
  const predictBtn = $("predictBtn");
  const resultBox = $("result");
  const errorBox = $("errorBox");
  const errorBody = $("errorBody");
  const retryBtn = $("retryBtn");

  /* ---- API base persistence -------------------------------------------- */

  const savedBase = localStorage.getItem("roomcall_api_base");
  apiBaseInput.value = savedBase || "http://127.0.0.1:8000";

  function apiBase() {
    return apiBaseInput.value.trim().replace(/\/+$/, "");
  }

  apiBaseInput.addEventListener("change", () => {
    localStorage.setItem("roomcall_api_base", apiBaseInput.value.trim());
    pingServer();
  });

  async function pingServer() {
    apiStatus.dataset.state = "unknown";
    try {
      const res = await fetch(apiBase() + "/", { method: "GET" });
      apiStatus.dataset.state = res.ok ? "ok" : "bad";
    } catch (_) {
      apiStatus.dataset.state = "bad";
    }
  }
  pingServer();

  /* ---- Neighbourhood datalist ------------------------------------------ */

  const frag = document.createDocumentFragment();
  NEIGHBOURHOODS.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    frag.appendChild(opt);
  });
  neighbourhoodList.appendChild(frag);

  /* ---- Slider <-> number sync -------------------------------------------- */

  function linkSlider(rangeId, numId) {
    const range = $(rangeId);
    const num = $(numId);
    const update = (val) => {
      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      const pct = ((val - min) / (max - min)) * 100;
      range.style.setProperty("--fill", pct + "%");
    };
    range.addEventListener("input", () => {
      num.value = range.value;
      update(range.value);
    });
    num.addEventListener("input", () => {
      let v = parseFloat(num.value);
      if (Number.isNaN(v)) return;
      v = Math.min(parseFloat(range.max), Math.max(parseFloat(range.min), v));
      range.value = v;
      update(v);
    });
    update(range.value);
  }

  [
    ["price", "price_num"],
    ["minimum_nights", "minimum_nights_num"],
    ["number_of_reviews", "number_of_reviews_num"],
    ["reviews_per_month", "reviews_per_month_num"],
    ["calculated_host_listings_count", "calculated_host_listings_count_num"],
    ["availability_365", "availability_365_num"],
  ].forEach(([r, n]) => linkSlider(r, n));

  /* ---- Schematic subway map -------------------------------------------- */

  const mapFrame = $("mapFrame");
  const canvas = $("subwayMap");
  const ctx = canvas.getContext("2d");
  const stations = Array.from(document.querySelectorAll(".station"));

  function stationPos(name) {
    const el = stations.find((s) => s.dataset.borough === name);
    const rect = el.getBoundingClientRect();
    const frameRect = mapFrame.getBoundingClientRect();
    return {
      x: rect.left - frameRect.left + rect.width / 2,
      y: rect.top - frameRect.top + rect.height / 2,
    };
  }

  let dpr = Math.max(window.devicePixelRatio || 1, 1);

  function resizeCanvas() {
    const rect = mapFrame.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let drawProgress = 0; // 0..1, animates the line reveal once on load
  let activeBorough = null;

  function draw() {
    const rect = mapFrame.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const lineColor = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
    const taxi = getComputedStyle(document.documentElement).getPropertyValue("--taxi").trim();

    CONNECTIONS.forEach(([a, b, dashed], i) => {
      const segStart = i / CONNECTIONS.length;
      const segEnd = (i + 1) / CONNECTIONS.length;
      const local = Math.max(0, Math.min(1, (drawProgress - segStart) / (segEnd - segStart)));
      if (local <= 0) return;

      const p1 = stationPos(a);
      const p2 = stationPos(b);
      const mx = p1.x + (p2.x - p1.x) * local;
      const my = p1.y + (p2.y - p1.y) * local;

      const isActiveLine = activeBorough && (a === activeBorough || b === activeBorough);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(mx, my);
      ctx.lineWidth = isActiveLine ? 2.5 : 1.5;
      ctx.strokeStyle = isActiveLine ? taxi : lineColor;
      if (dashed) ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function animateIn() {
    const start = performance.now();
    const duration = 900;
    function frame(t) {
      drawProgress = Math.min(1, (t - start) / duration);
      draw();
      if (drawProgress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Stagger the station pop-in.
    stations.forEach((s, i) => {
      s.style.animationDelay = 120 + i * 90 + "ms";
    });
  }

  window.addEventListener("resize", () => {
    dpr = Math.max(window.devicePixelRatio || 1, 1);
    resizeCanvas();
    draw();
  });

  function selectBorough(name, { fromClick = true } = {}) {
    activeBorough = name;
    stations.forEach((s) => s.setAttribute("aria-pressed", s.dataset.borough === name ? "true" : "false"));
    boroughSelect.value = name;
    if (fromClick && BOROUGH_CENTROIDS[name]) {
      latInput.value = BOROUGH_CENTROIDS[name].lat;
      lonInput.value = BOROUGH_CENTROIDS[name].lon;
    }
    draw();
  }

  stations.forEach((s) => {
    s.setAttribute("aria-pressed", "false");
    s.addEventListener("click", () => selectBorough(s.dataset.borough));
  });

  boroughSelect.addEventListener("change", () => {
    if (boroughSelect.value) selectBorough(boroughSelect.value, { fromClick: false });
  });

  resizeCanvas();
  requestAnimationFrame(() => {
    resizeCanvas();
    animateIn();
  });

  /* ---- Prediction request ------------------------------------------------ */

  function setLoading(isLoading) {
    predictBtn.classList.toggle("loading", isLoading);
    predictBtn.disabled = isLoading;
  }

  function renderResult(predicted, probabilities) {
    errorBox.hidden = true;
    resultBox.hidden = false;

    const meta = CLASS_META[predicted] || { color: "var(--taxi)", desc: "" };
    $("resultType").textContent = predicted;
    $("resultDesc").textContent = meta.desc;

    const dot = $("resultDot");
    dot.style.background = meta.color;
    dot.style.boxShadow = `0 0 0 6px ${meta.soft}`;

    const probsEl = $("probs");
    probsEl.innerHTML = "";
    CLASS_ORDER.forEach((cls, i) => {
      const p = probabilities[i] ?? 0;
      const pct = Math.round(p * 1000) / 10;
      const row = document.createElement("div");
      row.className = "prob-row";

      const name = document.createElement("span");
      name.className = "prob-name";
      name.textContent = cls;

      const track = document.createElement("div");
      track.className = "prob-track";
      const fill = document.createElement("div");
      fill.className = "prob-fill";
      fill.style.background = CLASS_META[cls].color;
      track.appendChild(fill);

      const pctEl = document.createElement("span");
      pctEl.className = "prob-pct";
      pctEl.textContent = pct + "%";

      row.append(name, track, pctEl);
      probsEl.appendChild(row);

      // Animate the width on next frame so the CSS transition plays.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = pct + "%";
        });
      });
    });

    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showError(message) {
    resultBox.hidden = true;
    errorBox.hidden = false;
    errorBody.textContent = message;
  }

  async function submitPrediction() {
    if (!form.reportValidity()) return;

    const payload = {
      latitude: parseFloat(latInput.value),
      longitude: parseFloat(lonInput.value),
      price: parseFloat($("price_num").value),
      minimum_nights: parseInt($("minimum_nights_num").value, 10),
      number_of_reviews: parseInt($("number_of_reviews_num").value, 10),
      reviews_per_month: parseFloat($("reviews_per_month_num").value),
      calculated_host_listings_count: parseInt($("calculated_host_listings_count_num").value, 10),
      availability_365: parseInt($("availability_365_num").value, 10),
      neighbourhood_group: boroughSelect.value,
      neighbourhood: $("neighbourhood").value,
    };

    setLoading(true);
    try {
      const res = await fetch(apiBase() + "/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Server responded ${res.status}. ${detail.slice(0, 200)}`);
      }

      const data = await res.json();
      apiStatus.dataset.state = "ok";
      renderResult(data.Predicted_room_type, data.Probability);
    } catch (err) {
      apiStatus.dataset.state = "bad";
      const reachable = err instanceof TypeError;
      showError(
        reachable
          ? `Can't reach ${apiBase() || "the server"}. Make sure your FastAPI server is running (uvicorn) and the address above is correct.`
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitPrediction();
  });

  retryBtn.addEventListener("click", () => {
    pingServer();
    submitPrediction();
  });
})();
