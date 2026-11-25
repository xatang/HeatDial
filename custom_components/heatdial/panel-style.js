export const styles = `
  :host {
    display: block; min-height: 100%; color: var(--primary-text-color);
    background: var(--primary-background-color); font: 400 15px/1.5 var(--primary-font-family, system-ui);
    --line: var(--divider-color); --muted: var(--secondary-text-color);
    --surface: var(--card-background-color); --accent: var(--primary-color);
  }
  * { box-sizing: border-box; }
  .wrap { width: min(100% - 36px, 1120px); margin: auto; padding: 26px 0 36px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 26px; font-weight: 650; }
  h2 { font-size: 17px; font-weight: 650; }
  a { color: var(--accent); text-underline-offset: 3px; }
  nav { display: flex; gap: 8px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
  button, select, input { font: inherit; color: inherit; }
  button, select, input[type="number"] {
    border: 1px solid var(--line); background: var(--surface); border-radius: 8px;
    padding: 8px 12px;
  }
  button { cursor: pointer; }
  button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
  button:disabled { cursor: wait; opacity: .65; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; }
  .block { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 19px; min-width: 0; }
  .overview { gap: 18px; }
  .overview .headline { font-size: clamp(24px, 4vw, 38px); }
  .main { border-inline-start: 4px solid var(--accent); }
  .main[data-advice="raise"] { border-inline-start-color: var(--warning-color, var(--accent)); }
  .main[data-advice="lower"] { border-inline-start-color: var(--info-color, var(--accent)); }
  .main[data-advice="hold"] { border-inline-start-color: var(--success-color, var(--accent)); }
  .label, .description, small, dt { color: var(--muted); }
  .headline { font-size: clamp(24px,5vw,42px); line-height: 1.12; font-weight: 680; margin: 10px 0 8px; }
  .mode { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .mode span { border: 1px solid var(--line); border-radius: 30px; padding: 2px 10px; font-size: 13px; }
  dl { margin: 16px 0 0; }
  .dial-states { display: flex; flex-wrap: wrap; gap: 12px 44px; }
  .dial-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .dial-summary > div { border-top:1px solid var(--line); padding-top:9px; }
  .dial-summary dd { font-size:30px; }
  dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .dial-states dd, .temperature { font-size: 27px; letter-spacing: -.02em; }
  .facts > div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); }
  .weather-now { margin-top:10px; }
  .weather-now strong { font-size:clamp(25px,4vw,34px); font-weight:650; font-variant-numeric:tabular-nums; }
  .weather-facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr)); gap:10px 16px; }
  .weather-facts > div { border-top:1px solid var(--line); padding-top:8px; }
  .weather-facts dt { font-size:13px; }
  .weather-facts dd { font-size:19px; }
  .rooms { grid-column: 1 / -1; }
  .room-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr)); gap:14px; margin-top:14px; }
  .room-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:2px 14px; margin-top:2px; }
  .room-card { --state-color:var(--success-color,var(--accent)); padding:15px; }
  .room-card[data-comfort="cool"] { --state-color:var(--info-color,var(--accent)); }
  .room-card[data-comfort="warm"] { --state-color:var(--warning-color,var(--accent)); }
  .room-card[data-comfort="missing"] { --state-color:var(--muted); }
  .room-card-title { display:flex; align-items:start; flex-wrap:wrap; justify-content:space-between; gap:4px 8px; }
  .room-card-title h3 { margin:0; font-size:14px; font-weight:650; overflow-wrap:anywhere; }
  .room-card-title small { border:1px solid var(--line); padding:1px 7px; border-radius:5px; white-space:nowrap; }
  .room-card .temperature { margin:8px 0 12px; font-size:29px; font-variant-numeric:tabular-nums; font-weight:650; }
  .comfort-track { position:relative; height:7px; border-radius:8px; background:linear-gradient(90deg,var(--info-color,#3b9ad6),var(--success-color,#409862) var(--edge),var(--success-color,#409862) calc(100% - var(--edge)),var(--warning-color,#e6a15b)); }
  .comfort-track i { position:absolute; inset-block:-3px; left:clamp(1px,var(--position),calc(100% - 1px)); width:4px; border-radius:3px; background:var(--primary-text-color); transform:translateX(-50%); outline:1px solid var(--surface); }
  .room-status { margin-top:10px; font-size:13px; color:var(--state-color); }
  .room-card[data-monitor="true"] .comfort-track { opacity:.72; }
  .room-card[data-comfort="missing"] .comfort-track { background:var(--line); }
  .tools, .save-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .history-tools { justify-content:space-between; }
  .history-period { display:flex; flex-wrap:wrap; gap:6px; }
  .history-period button { border-radius:20px; padding:5px 12px; }
  .plots { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr)); gap:14px; }
  .history-card h2 { margin-bottom:5px; }
  .plot-unit { display:block; }
  .decision-track { display:flex; height:10px; margin-top:18px; border-radius:8px; overflow:hidden; background:var(--line); }
  .decision-track i { background:var(--line); }
  .decision-track i[data-action="hold"] { background:var(--success-color,var(--accent)); }
  .decision-track i[data-action="raise"] { background:var(--warning-color,var(--accent)); }
  .decision-track i[data-action="lower"] { background:var(--info-color,var(--accent)); }
  .decision-list { margin:14px 0 0; padding:0; list-style:none; }
  .decision-list li { display:grid; grid-template-columns:minmax(65px,auto) 1fr; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); }
  .decision-list time { color:var(--muted); font-variant-numeric:tabular-nums; }
  canvas { display: block; width: 100%; height: 220px; margin-top: 10px; }
  .legend { padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 8px 18px; list-style: none; font-size: 13px; }
  .legend i { display: inline-block; width: 16px; margin-right: 6px; vertical-align: middle; border-top: 2px solid var(--series); }
  .settings-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; align-items:start; }
  .settings-column { display:grid; gap:14px; min-width:0; }
  .advanced-settings { grid-column:1 / -1; }
  .advanced-settings summary { cursor:pointer; font-size:17px; font-weight:650; }
  .advanced-settings p { margin-top:8px; }
  .advanced-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr)); gap:14px; margin-top:14px; }
  .advanced-grid section { padding:12px; min-width:0; border:1px solid var(--line); border-radius:10px; }
  .advanced-grid h3 { margin:0; font-size:15px; }
  .setting-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; border-top:1px solid var(--line); padding-top:8px; margin-top:8px; font-size:14px; }
  .stepper { display:grid; grid-template-columns:26px 53px 26px; align-items:center; gap:3px; }
  .stepper button { padding:0; height:26px; border-radius:50%; }
  .stepper input[type="number"] { padding:4px; text-align:center; font-variant-numeric:tabular-nums; appearance:textfield; }
  .stepper input::-webkit-inner-spin-button, .stepper input::-webkit-outer-spin-button { appearance:none; }
  .source-fields { display:grid; gap:12px; margin-top:14px; }
  .source-fields > label { display:grid; gap:5px; min-width:0; }
  .source-fields select { width:100%; min-width:0; text-overflow:ellipsis; }
  .source-preview { display:flex; justify-content:space-between; gap:10px; padding:0 2px; color:var(--muted); font-size:14px; }
  .source-preview output { color:var(--primary-text-color); font-variant-numeric:tabular-nums; font-weight:600; }
  .selected-rooms { margin-top:12px; }
  .selected-room { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:6px; align-items:center; padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; }
  .selected-room > button { padding:3px 6px; }
  .selected-room span { overflow-wrap:anywhere; }
  .selected-room label, .room-search { display:grid; gap:4px; font-size:14px; }
  .room-search { max-width:420px; margin-top:14px; }
  .room-search input { width:100%; background:var(--surface); color:inherit; border:1px solid var(--line); border-radius:8px; padding:8px 12px; }
  .room-results { display:grid; max-width:420px; gap:4px; margin-top:4px; }
  .room-results button { text-align:start; overflow-wrap:anywhere; }
  @media (max-width:1050px) { .settings-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width:760px) { .settings-grid { grid-template-columns:1fr; } }
  table { width:100%; border-collapse:collapse; margin:12px 0; text-align:left; }
  th, td { padding:6px 8px; border-bottom:1px solid var(--line); }
  td input { max-width:130px; }
  input[type="number"] { width: 100%; min-width: 0; }
  input[type="checkbox"] { accent-color: var(--accent); }
  .checkbox { display: flex; gap: 8px; align-items: center; margin-top: 18px; }
  .save-row { margin: 0; grid-column:1 / -1; }
  .save-row button { color: var(--text-primary-color, var(--primary-background-color)); background: var(--accent); border-color: transparent; font-weight: 600; }
  .error { color: var(--error-color, var(--primary-text-color)); }
  @media (max-width: 700px) { .layout { grid-template-columns: 1fr; } .wrap { width: calc(100% - 24px); padding-top: 18px; } .block { padding: 14px; } }
`;
