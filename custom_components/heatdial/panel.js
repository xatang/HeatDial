import { styles } from "./panel-style.js";
import { text } from "./panel-text.js";

const INTEGRATION = "/config/integrations/integration/heatdial";
const OPTIONS = "config/config_entries/options/flow";
const HOUR_MS = 3600000;
const FIELDS = [
  "day_min", "day_max", "night_min", "day_start", "day_end",
  "lower_from", "lower_until", "evening_from", "evening_until",
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
          <div><dt>${t.current}</dt><dd>${current ?? "—"}</dd>${flow(current)}</div>
          <div><dt>${t.recommended}</dt><dd>${rec ?? "—"}</dd>${flow(rec)}</div>
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
        <div class="room-list">${rooms.map(([id, weight]) => `
          <div class="room ${config.primary_rooms.includes(id) ? "primary" : ""}">
            <div>${escape(this.#name(id))}</div>
            <div class="temperature">${this.#temp(attrs.room_temperatures_c?.[id])}</div>
            <small>${t.weight} ${new Intl.NumberFormat(this.#locale).format(weight)}</small>
          </div>`).join("")}</div>
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
    const { room_weights, dial, entities } = this.#config;
    const rooms = Object.keys(room_weights);
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
    page.innerHTML = `<form class="layout">
      <section class="block"><h2>${t.settingsTitle}</h2>
        <div class="form-grid">${FIELDS.map((key) => {
          const temperature = key.endsWith("_min") || key === "day_max";
          return `<label>${t[key]}<input type="number" name="${key}" value="${escape(config.settings[key])}"
            min="${temperature ? 10 : 0}" max="${temperature ? 35 : 24}"
            step="${temperature ? 0.5 : 1}" required></label>`;
        }).join("")}</div>
        <label class="checkbox"><input type="checkbox" name="shadow_mode" ${config.shadow_mode ? "checked" : ""}>${t.shadowMode}</label>
      </section>
      <section class="block"><h2>${t.inputs}</h2>
        <div class="source-fields">
          ${select("dial", t.dialSource, dialIds, config.dial)}
          <div class="source-preview"><span>${t.current}</span><output data-dial-preview>—</output></div>
          ${select("outdoor", t.outdoor, temperatures, config.outdoor)}
          ${select("weather", t.weatherSource, weatherIds, config.weather, true)}
        </div>
      </section>
      <section class="block rooms"><h2>${t.rooms}</h2>
        <p class="description">${t.weightHelp}</p>
        <div class="selected-rooms"></div>
        <label class="room-search">${t.addRoom}
          <input type="search" autocomplete="off" placeholder="${t.searchRoom}"></label>
        <div class="room-results" aria-live="polite"></div>
      </section>
      <section class="block"><h2>${t.scale}</h2><p class="description">${t.scaleHelp}</p>
        <table><thead><tr><th scope="col">${t.dialStep}</th><th scope="col">${t.water}</th></tr></thead>
          <tbody id="scale-rows"></tbody></table>
        <div class="tools">
          <button type="button" data-scale="add">${t.addStep}</button>
          <button type="button" data-scale="remove">${t.removeStep}</button>
        </div>
      </section>
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
    form.addEventListener("submit", (event) => this.#save(event));
    form.querySelector('[name="dial"]').addEventListener("change", () => this.#updateDialPreview());
    this.#updateDialPreview();
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
      row.innerHTML = `<span>${escape(this.#name(id))}</span>
        <label>${t.weight}<input type="number" min="0" max="2" step="any" required
          name="room_weight" data-room="${escape(id)}" value="${weight}"></label>
        <button type="button" aria-label="${escape(`${t.removeRoom}: ${this.#name(id)}`)}">${t.removeRoom}</button>`;
      row.querySelector("button").addEventListener("click", () => {
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
    const dialScale = formData.getAll("scale_row").map((value) => numeric(value));
    const weights = Object.fromEntries(Array.from(form.querySelectorAll("[data-room]"), (input) => [
      input.dataset.room, Number(input.value),
    ]));
    const data = {
      ...values, shadow_mode: formData.has("shadow_mode"), dial: formData.get("dial"),
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
      this.#config = { ...config, ...data, settings: values, dial_scale: dialScale, room_weights: weights };
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
