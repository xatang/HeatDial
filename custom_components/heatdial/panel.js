import { styles } from "./panel-style.js";
import { text } from "./panel-text.js";

const INTEGRATION = "/config/integrations/integration/heatdial";
const OPTIONS = "config/config_entries/options/flow";
const HOUR_MS = 3600000;
const FIELDS = [
  "day_min", "day_max", "night_min", "day_start", "day_end",
  "lower_from", "lower_until", "evening_from", "evening_until", "max_dial",
];
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

  #update() {
    if (!this.isConnected || !this.#config || !this.#hass) return;
    const current = this.#state;
    const signature = [this.#locale, current, this.#config];
    const old = this.#signature;
    const rebuild = !old || signature[0] !== old[0] || signature[2] !== old[2];
    if (rebuild) this.#renderFrame();
    if (rebuild || (this.#tab === "overview" && old[1] !== current)) this.#renderTab();
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
    const action = rec != null && ["hold", "raise", "lower"].includes(state?.state) ? state.state : "wait";
    const reason = t.reasons[attrs.reason];
    const detail = attrs.reason_room
      ? `${this.#name(attrs.reason_room)} · ${this.#temp(attrs.reason_room_temperature_c)}`
      : "";
    const rooms = [[config.primary_rooms, "primary"], [config.secondary_rooms, "secondary"]];
    const facts = Object.entries({
      outdoor: attrs.outdoor_temperature_c,
      trend: attrs.outdoor_change_4h_c,
      low: attrs.forecast_sustained_low_c,
      end: attrs.forecast_end_c,
    });
    page.innerHTML = `<div class="layout">
      <section class="block main" data-advice="${action}">
        <p class="label">${t.decision}</p>
        <h2 class="headline">${t[action].replace("{dial}", rec)}</h2>
        ${reason ? `<p>${reason}</p>` : ""}
        ${detail ? `<p class="description">${escape(detail)}</p>` : ""}
        <dl class="dial-states">
          <div><dt>${t.current}</dt><dd>${current ?? "—"}</dd></div>
          <div><dt>${t.recommended}</dt><dd>${rec ?? "—"}</dd></div>
        </dl>
        <div class="mode"><span>${config.shadow_mode ? t.shadow : t.notices}</span>
          ${state?.last_updated ? `<span>${t.updated} ${this.#time(new Date(state.last_updated))}</span>` : ""}
        </div>
      </section>
      <section class="block">
        <h2>${t.outside}</h2>
        <dl class="facts">${facts.filter(([, value]) => value != null).map(([key, value]) =>
          `<div><dt>${t[key]}</dt><dd>${this.#temp(value)}</dd></div>`
        ).join("")}</dl>
        ${attrs.forecast_sustained_low_c == null ? `<p class="description">${t.noForecast}</p>` : ""}
      </section>
      <section class="block rooms">
        <h2>${t.rooms}</h2>
        <p class="description">${t.day} ${config.settings.day_min}–${config.settings.day_max} °C · ${t.night} ${this.#temp(config.settings.night_min)}</p>
        <div class="room-list">${rooms.flatMap(([ids, role]) => ids.map((id) => `
          <div class="room ${role}">
            <div>${escape(this.#name(id))}</div>
            <div class="temperature">${this.#temp(attrs.room_temperatures_c?.[id])}</div>
            <small>${t[role]}</small>
          </div>`)).join("")}</div>
      </section>
    </div>`;
  }

  #historyTab(page) {
    const t = this.#t;
    page.innerHTML = `<div class="tools">
      <select aria-label="${t.period}"><option value="24">${t.last24}</option>
        <option value="72">${t.last72}</option></select>
      <button type="button">${t.refresh}</button>
    </div><div class="plots" aria-live="polite"></div>`;
    const select = page.querySelector("select");
    select.value = String(this.#history?.hours ?? 24);
    const load = () => this.#loadHistory(Number(select.value), page.querySelector(".plots"));
    select.addEventListener("change", load);
    page.querySelector("button").addEventListener("click", load);
    load();
  }

  async #loadHistory(hours, plots) {
    const request = ++this.#request;
    this.#plots = [];
    plots.textContent = this.#t.loading;
    const { primary_rooms, secondary_rooms, dial, entities } = this.#config;
    const rooms = [...primary_rooms, ...secondary_rooms];
    const ids = [...rooms, dial, entities.recommended_dial].filter(Boolean);
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
        { label: t.roomChart, lines: rooms.map((id) => series(id, this.#name(id), true)), step: false },
        { label: t.dialChart, lines: [
          series(dial, t.current, false), series(entities.recommended_dial, t.recommended, false),
        ], step: true },
      ];
      plots.innerHTML = charts.map(({ label, lines }, index) => {
        const hasValues = lines.some(({ data }) => data.some(([, value]) => value !== null));
        return `<section class="block"><h2>${label}</h2>
          ${hasValues ? `<canvas data-plot="${index}" role="img" aria-label="${label}"></canvas><ul class="legend">${lines.map((line, i) =>
            `<li><i style="--series:var(${CHART_COLORS[i % CHART_COLORS.length]});border-top-style:${i % 2 ? "dashed" : "solid"}"></i>${escape(line.label)}</li>`
          ).join("")}</ul>` : `<p class="description">${t.noHistory}</p>`}
        </section>`;
      }).join("");
      this.#plots = Array.from(plots.querySelectorAll("canvas"), (canvas) => ({
        canvas, start, end, ...charts[Number(canvas.dataset.plot)],
      }));
      this.#drawPlots();
    } catch {
      if (request === this.#request && plots.isConnected) plots.textContent = this.#t.historyError;
    }
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
      const values = lines.flatMap(({ data }) => data.map(([, v]) => v).filter((v) => v !== null));
      const bottom = step ? 0 : Math.floor(Math.min(...values));
      const top = step ? Math.max(3, ...values) : Math.max(bottom + 1, Math.ceil(Math.max(...values)));
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
        ctx.fillText(this.#time(ts), x(ts), height - 6);
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
    const groups = Object.entries({
      primary: config.primary_rooms.map((id) => this.#name(id)).join(", "),
      secondary: config.secondary_rooms.map((id) => this.#name(id)).join(", "),
      outdoor: this.#name(config.outdoor), current: this.#name(config.dial),
      weatherSource: this.#name(config.weather),
    });
    page.innerHTML = `<div class="layout">
      <section class="block"><h2>${t.settingsTitle}</h2>
        <form><div class="form-grid">${FIELDS.map((key) => {
          const temperature = key.endsWith("_min") || key === "day_max";
          const limit = key === "max_dial";
          return `<label>${t[key]}<input type="number" name="${key}" value="${escape(config.settings[key])}"
            min="${temperature ? 10 : limit ? 1 : 0}" max="${temperature ? 35 : limit ? 12 : 24}"
            step="${temperature ? 0.5 : 1}" required></label>`;
        }).join("")}</div>
        <label class="checkbox"><input type="checkbox" name="shadow_mode" ${config.shadow_mode ? "checked" : ""}>${t.shadowMode}</label>
        <div class="save-row"><button type="submit">${t.save}</button><span role="status"></span></div>
        </form>
      </section>
      <section class="block"><h2>${t.inputs}</h2>
        <dl class="facts">${groups.map(([key, value]) =>
          `<div><dt>${t[key]}</dt><dd>${escape(value || "—")}</dd></div>`
        ).join("")}</dl>
        <p><a href="${INTEGRATION}">${t.editInputs}</a></p>
      </section>
    </div>`;
    page.querySelector("form").addEventListener("submit", (event) => this.#save(event));
  }

  async #save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const status = form.querySelector("[role=status]");
    const t = this.#t;
    const config = this.#config;
    button.disabled = true;
    status.classList.remove("error");
    status.textContent = t.saving;
    const formData = new FormData(form);
    const values = Object.fromEntries(FIELDS.map((key) => [key, Number(formData.get(key))]));
    const data = {
      ...values, shadow_mode: formData.has("shadow_mode"), dial: config.dial, outdoor: config.outdoor,
      primary_rooms: config.primary_rooms, secondary_rooms: config.secondary_rooms,
    };
    if (config.weather) data.weather = config.weather;
    try {
      const flow = await this.#hass.callApi("POST", OPTIONS, { handler: config.entry_id });
      const result = await this.#hass.callApi("POST", `${OPTIONS}/${flow.flow_id}`, data);
      if (result.type !== "create_entry") {
        status.classList.add("error");
        status.textContent = t[result.errors?.base] ?? t.saveError;
        return;
      }
      this.#config = { ...this.#config, settings: values, shadow_mode: data.shadow_mode };
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
