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
  dd { margin: 0; font-variant-numeric: tabular-nums; font-weight: 600; }
  .dial-states dd, .temperature { font-size: 27px; letter-spacing: -.02em; }
  .facts > div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); }
  .rooms { grid-column: 1 / -1; }
  .room-list, .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 14px; margin-top: 14px; }
  .room { padding: 4px 0 4px 12px; border-inline-start: 2px solid var(--line); overflow-wrap: anywhere; }
  .room.primary { border-color: var(--accent); }
  .room .temperature { margin-bottom: 2px; }
  .tools, .save-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .plots { display: grid; gap: 14px; }
  canvas { display: block; width: 100%; height: 220px; margin-top: 10px; }
  .legend { padding: 0; margin: 8px 0 0; display: flex; flex-wrap: wrap; gap: 8px 18px; list-style: none; font-size: 13px; }
  .legend i { display: inline-block; width: 16px; margin-right: 6px; vertical-align: middle; border-top: 2px solid var(--series); }
  .form-grid label { display: grid; gap: 5px; font-size: 14px; }
  .source-fields { display:grid; gap:12px; margin-top:14px; }
  .source-fields > label { display:grid; gap:5px; min-width:0; }
  .source-fields select { width:100%; min-width:0; text-overflow:ellipsis; }
  .source-preview { display:flex; justify-content:space-between; gap:10px; padding:0 2px; color:var(--muted); font-size:14px; }
  .source-preview output { color:var(--primary-text-color); font-variant-numeric:tabular-nums; font-weight:600; }
  fieldset { min-width:0; border:1px solid var(--line); border-radius:8px; margin:0; padding:8px; }
  .room-options { max-height:135px; overflow:auto; }
  .check-row { display:flex; align-items:start; gap:8px; padding:4px; overflow-wrap:anywhere; }
  .check-row input { flex:none; }
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
