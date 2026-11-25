import { styles } from "./panel-style.js";
import { text } from "./panel-text.js";

const INTEGRATION = "/config/integrations/integration/heatdial";
const OPTIONS = "config/config_entries/options/flow";
const HOUR_MS = 3600000;
const MAX_ROOM_AGE = 90 * 60000;
const HISTORY_HOURS = [24, 72, 168];
const COMFORT_FIELDS = ["day_min", "day_max", "night_min"];
const SCHEDULE_FIELDS = ["day_start", "day_end", "lower_from", "lower_until", "evening_from", "evening_until"];
const FIELDS = [
  ...COMFORT_FIELDS, ...SCHEDULE_FIELDS,
];
const TUNING_GROUPS = {
  tuningRoom: ["cold_minutes", "deep_cold_minutes", "deep_cold_degrees", "secondary_margin_degrees"],
  tuningAiring: ["airing_drop_degrees", "airing_peer_degrees", "airing_minutes"],
  tuningWeather: ["forecast_hours", "forecast_bias_hours", "forecast_low_hours", "outdoor_cooling_degrees",
    "strong_cooling_degrees", "evening_room_drop_degrees", "rebound_degrees"],
  tuningTiming: ["confirmation_minutes", "settling_minutes"],
};
const CHART_COLORS = ["--primary-color", "--warning-color", "--success-color", "--info-color",
  "--accent-color"];

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function numeric(value) {
  return value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
}

function toCelsius(value, unit) {
  if (value === null) return null;
  if (unit === "°F") return (value - 32) * 5 / 9;
  if (unit === "K") return value - 273.15;
  return value;
}

class HeatDialPanel extends HTMLElement {
  #hass;
  #config;
  #tab = "overview";
  #signature;
  #history = null;
  #plots = [];
  #request = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.observer = new ResizeObserver(() => this.#drawPlots());
  }

  connectedCallback() {
    this.observer.observe(this);
    this.#update();
  }

  disconnectedCallback() {
    this.observer.disconnect();
    this.#request += 1;
  }

  set hass(value) {
    this.#hass = value;
    this.#update();
  }

  set panel(value) {
    this.#config = value.config;
    this.#signature = undefined;
    this.#update();
  }

  get #locale() {
    return this.#hass.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
  }

  get #t() {
    return text[this.#locale];
  }

  get #state() {
    return this.#hass.states[this.#config.entities.recommendation];
  }

  #temp(value) {
    return value == null ? "—" : `${new Intl.NumberFormat(this.#locale, { maximumFractionDigits: 1 }).format(value)} °C`;
  }

  #name(id) {
    if (!id) return "—";
    const state = this.#hass.states[id];
    return state ? (this.#hass.formatEntityName?.(state) || state.attributes.friendly_name || id) : id;
  }

  #time(timestamp) {
    return new Intl.DateTimeFormat(this.#locale, {
      hour: "2-digit", minute: "2-digit", timeZone: this.#hass.config?.time_zone,
    }).format(timestamp);
  }

  #isDay() {
    const hour = Number(new Intl.DateTimeFormat("en-GB", {
      hour: "numeric", hourCycle: "h23", timeZone: this.#hass.config?.time_zone,
    }).format(new Date()));
    const { day_start, day_end } = this.#config.settings;
    return day_start <= hour && hour < day_end;
  }

  #update() {
    if (!this.isConnected || !this.#config || !this.#hass) return;
    const current = this.#state;
    const roomStates = Object.keys(this.#config.room_weights).map((key) => this.#hass.states[key]);
    const signature = [this.#locale, current, this.#config, this.#isDay(), ...roomStates];
    const old = this.#signature;
    const rebuild = !old || signature[0] !== old[0] || signature[2] !== old[2];
    if (rebuild) this.#renderFrame();
    if (rebuild || (this.#tab === "overview" && signature.some((value, index) => value !== old[index]))) {
      this.#renderTab();
    }
    if (this.#tab === "settings") this.#updateDialPreview();
    this.#signature = signature;
  }

  #renderFrame() {
    const t = this.#t;
    this.shadowRoot.innerHTML = `<style>${styles}</style>
      <main class="wrap">
        <header><h1>HeatDial</h1><a href="${INTEGRATION}">${t.back}</a></header>
        <nav aria-label="HeatDial">${["overview", "history", "settings"].map((key) =>
          `<button data-tab="${key}" type="button" aria-pressed="${this.#tab === key}">${t[key]}</button>`
        ).join("")}</nav>
        <div id="page"></div>
      </main>`;
    this.shadowRoot.querySelector("nav").addEventListener("click", (event) => {
      const tab = event.target.dataset.tab;
      if (!tab || tab === this.#tab) return;
      this.#tab = tab;
      for (const button of this.shadowRoot.querySelectorAll("nav button")) {
        button.setAttribute("aria-pressed", String(button.dataset.tab === tab));
      }
      this.#renderTab();
    });
  }

  #renderTab() {
    this.#plots = [];
    const page = this.shadowRoot.getElementById("page");
    if (this.#tab === "overview") this.#overview(page);
    if (this.#tab === "history") this.#historyTab(page);
    if (this.#tab === "settings") this.#settings(page);
  }

  #overview(page) {
    const config = this.#config;
    const t = this.#t;
    const state = this.#state;
    const attrs = state?.attributes ?? {};
    const rec = numeric(attrs.recommended_dial);
    const current = numeric(attrs.current_dial);
    const flow = (dial) => {
      const value = config.dial_scale?.[dial - 1];
      return value == null ? "" : `<small>≈ ${this.#temp(value)}</small>`;
    };
    const action = rec != null && ["hold", "raise", "lower"].includes(state?.state) ? state.state : "wait";
    const reason = t.reasons[attrs.reason];
    const detail = attrs.reason_room
      ? `${this.#name(attrs.reason_room)} · ${this.#temp(attrs.reason_room_temperature_c)}`
      : "";
    const rooms = Object.entries(config.room_weights);
    const day = this.#isDay();
    const { day_min, day_max, night_min } = config.settings;
    const minimum = day ? day_min : night_min;
    const facts = Object.entries({
      trend: attrs.outdoor_change_4h_c,
      low: attrs.forecast_sustained_low_c,
      end: attrs.forecast_end_c,
    });
    page.innerHTML = `<div class="layout overview">
      <section class="block main" data-advice="${action}">
        <p class="label">${t.decision}</p>
        <h2 class="headline">${t[action].replace("{dial}", rec)}</h2>
        ${reason ? `<p>${reason}</p>` : ""}
        ${detail ? `<p class="description">${escape(detail)}</p>` : ""}
        <dl class="dial-states dial-summary">
          <div><dt>${t.current}</dt><dd>${current ?? "—"}</dd>${flow(current)}</div>
          <div><dt>${t.recommended}</dt><dd>${rec ?? "—"}</dd>${flow(rec)}</div>
        </dl>
        <div class="mode"><span>${config.shadow_mode ? t.shadow : t.notices}</span>
          ${state?.last_updated ? `<span>${t.updated} ${this.#time(new Date(state.last_updated))}</span>` : ""}
        </div>
      </section>
      <section class="block weather">
        <h2>${t.outside}</h2>
        <div class="weather-now"><strong>${this.#temp(attrs.outdoor_temperature_c)}</strong><p class="description">${t.outdoor}</p></div>
        <dl class="weather-facts">${facts.filter(([, value]) => value != null).map(([key, value]) =>
          `<div><dt>${t[key]}</dt><dd>${key === "trend" && value > 0 ? "+" : ""}${this.#temp(value)}</dd></div>`
        ).join("")}</dl>
        ${attrs.forecast_sustained_low_c == null ? `<p class="description">${t.noForecast}</p>` : ""}
      </section>
      <section class="rooms">
        <div class="room-heading"><h2>${t.rooms}</h2>
          <p class="description">${day ? t.day : t.nightComfort} ${this.#temp(minimum)} – ${this.#temp(day_max)}</p></div>
        <div class="room-list">${rooms.map(([id, weight]) =>
          this.#roomCard(id, weight, this.#liveRoomTemperature(id), minimum, day_max)
        ).join("")}</div>
      </section>
    </div>`;
  }

  #liveRoomTemperature(id) {
    const state = this.#hass.states[id];
    if (!state) return null;
    const stamp = Date.parse(state.last_reported ?? state.last_updated);
    if (Number.isFinite(stamp) && Date.now() - stamp > MAX_ROOM_AGE) return null;
    return toCelsius(numeric(state.state), state.attributes.unit_of_measurement);
  }

  #roomCard(id, weight, value, minimum, maximum) {
    const t = this.#t;
    const status = value === null ? "missing" : value < minimum ? "cool" : value > maximum ? "warm" : "comfort";
    const span = maximum - minimum + 4;
    const edge = 200 / span;
    const position = value === null ? 0 : Math.max(0, Math.min(100, (value - minimum + 2) / span * 100));
    const quality = status === "cool" ? t.belowComfort : status === "warm" ? t.aboveComfort
      : status === "comfort" ? t.inComfort : t.noRoomReading;
    const weightLabel = weight === 0 ? t.roomMonitor
      : `${t.weight} ${new Intl.NumberFormat(this.#locale).format(weight)}`;
    return `<article class="block room-card" data-comfort="${status}" data-monitor="${weight === 0}">
      <div class="room-card-title"><h3>${escape(this.#name(id))}</h3><small>${weightLabel}</small></div>
      <div class="temperature">${this.#temp(value)}</div>
      <div class="comfort-track" style="--edge:${edge}%;--position:${position}%" aria-hidden="true">
        ${value === null ? "" : "<i></i>"}
      </div>
      <p class="room-status">${quality}</p>
    </article>`;
  }

  #historyTab(page) {
    const t = this.#t;
    let hours = this.#history?.hours ?? 24;
    page.innerHTML = `<div class="tools history-tools">
      <div class="history-period" role="group" aria-label="${t.period}">
        ${HISTORY_HOURS.map((value) => `<button type="button" data-hours="${value}" aria-pressed="${hours === value}">${t[`last${value}`]}</button>`).join("")}
      </div>
      <button type="button" data-refresh>${t.refresh}</button>
    </div><div class="plots" aria-live="polite"></div>`;
    const load = () => this.#loadHistory(hours, page.querySelector(".plots"));
    const choices = page.querySelectorAll("[data-hours]");
    for (const button of choices) button.addEventListener("click", () => {
      hours = Number(button.dataset.hours);
      for (const option of choices) option.setAttribute("aria-pressed", String(option === button));
      load();
    });
    page.querySelector("[data-refresh]").addEventListener("click", load);
    load();
  }

  async #loadHistory(hours, plots) {
    const request = ++this.#request;
    this.#plots = [];
    plots.textContent = this.#t.loading;
    const { room_weights, dial, outdoor, entities } = this.#config;
    const rooms = Object.keys(room_weights);
    const ids = [...new Set([...rooms, dial, outdoor, entities.recommended_dial, entities.recommendation].filter(Boolean))];
    const end = Date.now();
    const start = end - hours * HOUR_MS;
    try {
      const data = await this.#hass.callWS({
        type: "history/history_during_period", start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(), entity_ids: ids,
        minimal_response: true, no_attributes: true,
      });
      if (request !== this.#request || !plots.isConnected) return;
      this.#history = { hours };
      const t = this.#t;
      const series = (id, label, isTemperature) => ({
        label, data: (data[id] ?? []).map((row) => {
          const ts = (row.lc ?? row.lu) * 1000;
          const value = numeric(row.s);
          return [ts, isTemperature ? toCelsius(value, this.#hass.states[id]?.attributes.unit_of_measurement) : value];
        }).filter(([ts]) => Number.isFinite(ts)),
      });
      const charts = [
        { label: t.roomChart, lines: rooms.map((id) => series(id, this.#name(id), true)), step: false, unit: "°C" },
        { label: t.outdoor, lines: [series(outdoor, t.outdoor, true)], step: false, unit: "°C" },
        { label: t.dialChart, lines: [
          series(dial, t.current, false), series(entities.recommended_dial, t.recommended, false),
        ], step: true, unit: "" },
      ];
      plots.innerHTML = charts.map(({ label, lines, unit }, index) => {
        const hasValues = lines.some(({ data }) => data.some(([, value]) => value !== null));
        return `<section class="block history-card"><h2>${label}</h2>
          ${hasValues && unit ? `<small class="plot-unit">${unit}</small>` : ""}
          ${hasValues ? `<canvas data-plot="${index}" role="img" aria-label="${label}"></canvas><ul class="legend">${lines.map((line, i) =>
            `<li><i style="--series:var(${CHART_COLORS[i % CHART_COLORS.length]});border-top-style:${i % 2 ? "dashed" : "solid"}"></i>${escape(line.label)}${line.data.at(-1)?.[1] != null ? ` <strong>${unit === "°C" ? this.#temp(line.data.at(-1)[1]) : line.data.at(-1)[1]}</strong>` : ""}</li>`
          ).join("")}</ul>` : `<p class="description">${t.noHistory}</p>`}
        </section>`;
      }).join("") + this.#decisionHistory(data[entities.recommendation] ?? [], start, end);
      this.#plots = Array.from(plots.querySelectorAll("canvas"), (canvas) => ({
        canvas, start, end, ...charts[Number(canvas.dataset.plot)],
      }));
      this.#drawPlots();
    } catch {
      if (request === this.#request && plots.isConnected) plots.textContent = this.#t.historyError;
    }
  }

  #decisionHistory(rows, start, end) {
    const t = this.#t;
    const changes = rows.map((row) => ({ at: (row.lc ?? row.lu) * 1000, action: row.s }))
      .filter(({ at }) => Number.isFinite(at) && at < end);
    const last = changes.slice(-5).reverse();
    const spans = changes.map(({ at, action }, index) => {
      const width = 100 * (Math.min(end, changes[index + 1]?.at ?? end) - Math.max(start, at)) / (end - start);
      return width > 0 ? `<i data-action="${["hold", "raise", "lower", "wait"].includes(action) ? action : "missing"}" style="width:${width}%"></i>` : "";
    }).join("");
    return `<section class="block history-card"><h2>${t.decisions}</h2>
      ${last.length ? `<div class="decision-track" aria-hidden="true">${spans}</div>
        <ol class="decision-list">${last.map(({ at, action }) => `<li><time datetime="${new Date(at).toISOString()}">${this.#historyDate(at, end - start)}</time>
          <span>${t.actions[action] ?? t.noRoomReading}</span></li>`).join("")}</ol>`
        : `<p class="description">${t.noHistory}</p>`}</section>`;
  }

  #historyDate(ts, span) {
    if (span <= 24 * HOUR_MS) return this.#time(ts);
    return new Intl.DateTimeFormat(this.#locale, {
      day: "numeric", month: "short", timeZone: this.#hass.config?.time_zone,
    }).format(ts);
  }

  #drawPlots() {
    for (const { canvas, lines, start, end, step } of this.#plots) {
      const width = canvas.clientWidth;
      if (!width || !canvas.isConnected) continue;
      const height = canvas.clientHeight;
      const scale = window.devicePixelRatio || 1;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.font = "12px system-ui";
      const css = getComputedStyle(canvas);
      const x = (ts) => 39 + (width - 50) * (Math.min(end, Math.max(start, ts)) - start) / (end - start);
      let low = Infinity, high = -Infinity;
      for (const { data } of lines) for (const [, value] of data) {
        if (value === null) continue;
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
      const bottom = step ? 0 : Math.floor(low);
      const top = step ? Math.max(3, high) : Math.max(bottom + 1, Math.ceil(high));
      const y = (v) => 12 + (height - 42) * (top - v) / (top - bottom);
      const ticks = Math.min(step ? top : 4, 6);
      ctx.strokeStyle = css.getPropertyValue("--divider-color").trim() || "#606060";
      ctx.fillStyle = css.getPropertyValue("--secondary-text-color").trim() || "#888";
      for (let i = 0; i <= ticks; i += 1) {
        const raw = bottom + (top - bottom) * i / ticks;
        const value = step ? Math.round(raw) : raw;
        ctx.beginPath();
        ctx.moveTo(x(start), y(value));
        ctx.lineTo(x(end), y(value));
        ctx.stroke();
        ctx.fillText(step ? String(value) : value.toFixed(1), 1, y(value) + 4);
      }
      ctx.textAlign = "center";
      for (let i = 1; i <= 3; i += 1) {
        const ts = start + (end - start) * i / 4;
        ctx.fillText(this.#historyDate(ts, end - start), x(ts), height - 6);
      }
      lines.forEach(({ data }, i) => {
        ctx.strokeStyle = css.getPropertyValue(CHART_COLORS[i % CHART_COLORS.length]).trim() || "#888";
        ctx.lineWidth = 2;
        ctx.setLineDash(i % 2 ? [5, 3] : []);
        ctx.beginPath();
        let previous = null;
        for (const [ts, value] of data) {
          if (value === null) {
            if (step && previous !== null) ctx.lineTo(x(ts), y(previous));
            previous = null;
          } else if (previous === null) {
            ctx.moveTo(x(ts), y(value));
            previous = value;
          } else {
            if (step) ctx.lineTo(x(ts), y(previous));
            ctx.lineTo(x(ts), y(value));
            previous = value;
          }
        }
        if (previous !== null) ctx.lineTo(x(end), y(previous));
        ctx.stroke();
      });
    }
  }

  #settings(page) {
    const t = this.#t;
    const config = this.#config;
    const states = Object.entries(this.#hass.states);
    const temperatures = states.filter(([, state]) => state.attributes.device_class === "temperature")
      .map(([id]) => id).filter((id) => id.startsWith("sensor."));
    const dialIds = states.filter(([id, state]) => /^(input_number|number)\./.test(id)
      || (id.startsWith("sensor.") && numeric(state.state) !== null)).map(([id]) => id);
    const weatherIds = Object.keys(this.#hass.states).filter((id) => id.startsWith("weather."));
    const ordered = (ids, saved) => [...new Set([...ids, ...saved].filter(Boolean))].sort(
      (left, right) => this.#name(left).localeCompare(this.#name(right), this.#locale)
    );
    const select = (key, label, ids, saved, optional = false) => `<label>${label}
      <select name="${key}" ${optional ? "" : "required"}>
        <option value="" ${optional ? "" : "disabled"}>—</option>
        ${ordered(ids, [saved]).map((id) => `<option value="${escape(id)}" ${saved === id ? "selected" : ""}>${escape(this.#name(id))}</option>`).join("")}
      </select></label>`;
    const rows = (keys, temperature) => keys.map((key) => `<div class="setting-row">
      <label for="heatdial-${key}">${t[key]}</label>
      ${this.#stepper(`<input type="number" id="heatdial-${key}" name="${key}" value="${escape(config.settings[key])}"
        min="${temperature ? 10 : 0}" max="${temperature ? 35 : 24}"
        step="${temperature ? 0.5 : 1}" required>`, t[key], temperature ? 0.5 : 1)}
    </div>`).join("");
    page.innerHTML = `<form class="settings-grid">
      <div class="settings-column">
      <section class="block"><h2>${t.comfortTitle}</h2>${rows(COMFORT_FIELDS, true)}</section>
      <section class="block"><h2>${t.scheduleTitle}</h2>${rows(SCHEDULE_FIELDS, false)}</section>
      <section class="block"><h2>${t.modeTitle}</h2>
        <label class="checkbox"><input type="checkbox" name="shadow_mode" ${config.shadow_mode ? "checked" : ""}>${t.shadowMode}</label>
      </section>
      </div>
      <div class="settings-column">
      <section class="block"><h2>${t.inputs}</h2>
        <div class="source-fields">
          ${select("dial", t.dialSource, dialIds, config.dial)}
          <div class="source-preview"><span>${t.current}</span><output data-dial-preview>—</output></div>
          ${select("outdoor", t.outdoor, temperatures, config.outdoor)}
          ${select("weather", t.weatherSource, weatherIds, config.weather, true)}
        </div>
      </section>
      <section class="block"><h2>${t.roomSettings}</h2>
        <p class="description">${t.weightHelp}</p>
        <div class="selected-rooms"></div>
        <label class="room-search">${t.addRoom}
          <input type="search" autocomplete="off" placeholder="${t.searchRoom}"></label>
        <div class="room-results" aria-live="polite"></div>
      </section>
      </div>
      <div class="settings-column">
      <section class="block"><h2>${t.scale}</h2><p class="description">${t.scaleHelp}</p>
        <table><thead><tr><th scope="col">${t.dialStep}</th><th scope="col">${t.water}</th></tr></thead>
          <tbody id="scale-rows"></tbody></table>
        <div class="tools">
          <button type="button" data-scale="add">${t.addStep}</button>
          <button type="button" data-scale="remove">${t.removeStep}</button>
        </div>
      </section>
      </div>
      ${this.#advancedSettings(config)}
      <div class="save-row"><button type="submit">${t.save}</button><span role="status"></span></div>
    </form>`;
    const form = page.querySelector("form");
    this.#editRooms(form, temperatures);
    const table = form.querySelector("#scale-rows");
    const renderScale = (values) => {
      table.innerHTML = values.map((value, index) => `<tr><th scope="row">${index + 1}</th>
        <td><input type="number" name="scale_row" min="0.1" max="100" step="any"
          aria-label="${t.water}, ${t.dialStep} ${index + 1}" value="${escape(value)}"></td></tr>`).join("");
      form.querySelector('[data-scale="remove"]').disabled = values.length <= 1;
      form.querySelector('[data-scale="add"]').disabled = values.length >= 24;
    };
    renderScale(config.dial_scale ?? [null]);
    for (const button of form.querySelectorAll("[data-scale]")) {
      button.addEventListener("click", () => {
        const values = Array.from(table.querySelectorAll("input"), (input) => input.value);
        if (button.dataset.scale === "add") values.push(null);
        else values.pop();
        renderScale(values);
      });
    }
    form.addEventListener("click", (event) => {
      const button = event.target.closest("[data-step]");
      if (!button) return;
      const input = button.parentElement.querySelector("input");
      const next = (numeric(input.value) ?? 0) + Number(button.dataset.step);
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), Number(next.toFixed(8))));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    form.addEventListener("submit", (event) => this.#save(event));
    form.querySelector('[name="dial"]').addEventListener("change", () => this.#updateDialPreview());
    this.#updateDialPreview();
  }

  #advancedSettings(config) {
    if (!config.tuning_limits) return "";
    const t = this.#t;
    return `<details class="block advanced-settings">
      <summary>${t.advancedTitle}</summary>
      <p class="description">${t.advancedHelp}</p>
      <div class="advanced-grid">${Object.entries(TUNING_GROUPS).map(([group, keys]) => `
        <section><h3>${t[group]}</h3>
          ${keys.map((key) => {
            const [min, max, step] = config.tuning_limits[key];
            return `<div class="setting-row">
              <label for="heatdial-${key}">${t[key]}</label>
              ${this.#stepper(`<input type="number" id="heatdial-${key}" name="${key}"
                value="${escape(config.tuning[key])}" min="${min}" max="${max}"
                step="${Number.isInteger(step) ? 1 : "any"}" required>`, t[key], step)}
            </div>`;
          }).join("")}
        </section>`).join("")}</div>
    </details>`;
  }

  #stepper(input, label, step) {
    const t = this.#t;
    return `<span class="stepper">
      <button type="button" data-step="-${step}" aria-label="${escape(`${t.decrease} · ${label}`)}">−</button>
      ${input}
      <button type="button" data-step="${step}" aria-label="${escape(`${t.increase} · ${label}`)}">+</button>
    </span>`;
  }

  #updateDialPreview() {
    const source = this.shadowRoot.querySelector('[name="dial"]');
    const preview = this.shadowRoot.querySelector("[data-dial-preview]");
    if (!source || !preview) return;
    const value = numeric(this.#hass.states[source.value]?.state);
    const display = String(value ?? "—");
    if (preview.textContent !== display) preview.textContent = display;
  }

  #editRooms(form, temperatures) {
    const t = this.#t;
    const selected = form.querySelector(".selected-rooms");
    const search = form.querySelector('input[type="search"]');
    const results = form.querySelector(".room-results");
    const add = (id, weight) => {
      const row = document.createElement("div");
      row.className = "selected-room";
      const name = this.#name(id);
      const label = `${t.weight} · ${name}`;
      row.innerHTML = `<span>${escape(name)}</span>
        ${this.#stepper(`<input aria-label="${escape(label)}" type="number" min="0" max="2" step="any" required
          name="room_weight" data-room="${escape(id)}" value="${weight}">`, label, 0.1)}
        <button type="button" data-remove-room aria-label="${escape(`${t.removeRoom} · ${name}`)}">${t.removeRoom}</button>`;
      row.querySelector("[data-remove-room]").addEventListener("click", () => {
        row.remove();
        updateResults();
        search.focus();
      });
      selected.append(row);
    };
    const updateResults = () => {
      const query = search.value.toLocaleLowerCase(this.#locale).trim();
      const existing = new Set(Array.from(selected.querySelectorAll("[data-room]"), (input) => input.dataset.room));
      const available = temperatures.filter((id) => !existing.has(id)
        && id !== form.elements.outdoor.value && id !== form.elements.dial.value);
      const matches = query ? available.filter((id) =>
        `${this.#name(id)} ${id}`.toLocaleLowerCase(this.#locale).includes(query)
      ).sort((a, b) => this.#name(a).localeCompare(this.#name(b), this.#locale)).slice(0, 8) : [];
      results.replaceChildren();
      if (!query) return;
      if (!matches.length) results.textContent = t.noRoomMatches;
      for (const id of matches) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = this.#name(id);
        button.addEventListener("click", () => {
          add(id, 1);
          search.value = "";
          updateResults();
          search.focus();
        });
        results.append(button);
      }
    };
    for (const [id, weight] of Object.entries(this.#config.room_weights)) add(id, weight);
    search.addEventListener("input", updateResults);
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    form.elements.outdoor.addEventListener("change", updateResults);
    form.elements.dial.addEventListener("change", updateResults);
  }

  async #save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[role=status]");
    const t = this.#t;
    const config = this.#config;
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = t.saving;
    const formData = new FormData(form);
    const values = Object.fromEntries(FIELDS.map((key) => [key, Number(formData.get(key))]));
    const tuning = Object.fromEntries(Object.keys(config.tuning_limits ?? {}).map((key) => [
      key, Number(formData.get(key)),
    ]));
    const dialScale = formData.getAll("scale_row").map((value) => numeric(value));
    const weights = Object.fromEntries(Array.from(form.querySelectorAll("[data-room]"), (input) => [
      input.dataset.room, Number(input.value),
    ]));
    const data = {
      ...values, ...tuning, shadow_mode: formData.has("shadow_mode"), dial: formData.get("dial"),
      outdoor: formData.get("outdoor"), dial_scale: dialScale.map((value) => value ?? "-").join(";"),
      primary_rooms: Object.keys(weights).filter((key) => weights[key] >= 1),
      secondary_rooms: Object.keys(weights).filter((key) => weights[key] < 1),
      room_weights: JSON.stringify(weights),
    };
    if (formData.get("weather")) data.weather = formData.get("weather");
    try {
      const flow = await this.#hass.callApi("POST", OPTIONS, { handler: config.entry_id });
      const result = await this.#hass.callApi("POST", `${OPTIONS}/${flow.flow_id}`, data);
      if (result.type !== "create_entry") {
        status.classList.add("error");
        status.textContent = t[result.errors?.base] ?? t.saveError;
        return;
      }
      this.#config = { ...config, ...data, settings: values, tuning, dial_scale: dialScale, room_weights: weights };
      status.textContent = t.saved;
    } catch {
      status.classList.add("error");
      status.textContent = t.saveError;
    } finally {
      button.disabled = false;
    }
  }
}

if (!customElements.get("heatdial-panel")) {
  customElements.define("heatdial-panel", HeatDialPanel);
}
