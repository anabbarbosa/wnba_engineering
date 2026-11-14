// Hand-built d3 charts. Shared rules: one y-axis per chart, recessive grid, team colour only
// marks a highlighted team (everything else is the "ghost" ink), hover tooltip on every mark.
import * as d3 from "d3";

// ── colour helpers ───────────────────────────────────────
const lum = (hex) => {
  const c = d3.rgb(hex);
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** the team colour (or its alternate) that stays visible on the current paper */
export function teamInk(team) {
  const paper = css("--paper") || "#f2ebdd";
  const opts = [team.color, team.alternate_color].filter(Boolean);
  const best = opts.sort((a, b) => contrast(b, paper) - contrast(a, paper))[0];
  return best && contrast(best, paper) >= 2.6 ? best : css("--ink");
}
/** black or white text on top of a team colour */
export const onColor = (hex) => (contrast(hex, "#141210") > contrast(hex, "#ffffff") ? "#141210" : "#ffffff");

// ── tooltip ──────────────────────────────────────────────
const tipEl = () => document.getElementById("tip");
export function showTip(html, event) {
  const el = tipEl();
  el.innerHTML = html;
  el.hidden = false;
  const pad = 14, { innerWidth: W, innerHeight: H } = window;
  const r = el.getBoundingClientRect();
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + r.width > W - 8) x = event.clientX - r.width - pad;
  if (y + r.height > H - 8) y = event.clientY - r.height - pad;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}
export const hideTip = () => { tipEl().hidden = true; };
const rows = (pairs) => pairs.map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join("");

// ── responsive frame ─────────────────────────────────────
function frame(el, height, margin, draw) {
  const render = () => {
    const width = Math.max(280, el.clientWidth);
    const h = typeof height === "function" ? height(width) : height;
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${h}`).attr("role", "img");
    const iw = width - margin.left - margin.right, ih = h - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    draw({ svg, g, iw, ih, width, height: h });
  };
  render();
  let last = el.clientWidth;
  const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - last) > 4) { last = el.clientWidth; render(); } });
  ro.observe(el);
  return { redraw: render, destroy: () => ro.disconnect() };
}

function yGrid(g, y, iw, { ticks = 5, fmt } = {}) {
  g.append("g").attr("class", "axis")
    .call(d3.axisLeft(y).ticks(ticks).tickSize(-iw).tickPadding(8).tickFormat(fmt))
    .call((a) => a.selectAll(".tick line").attr("stroke-dasharray", "1 3"));
}
function xAxis(g, x, ih, { ticks, fmt } = {}) {
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(ticks).tickSize(0).tickPadding(10).tickFormat(fmt));
}
const fmtDate = d3.utcFormat("%b %-d");
const parseDate = d3.utcParse("%Y-%m-%d");

// ── standings race: every team a ghost line, pinned teams in their colour ──
export function raceChart(el, { series, teams, pinned, onToggle }) {
  return frame(el, (w) => Math.min(460, Math.max(300, w * 0.55)), { top: 16, right: 64, bottom: 36, left: 40 }, ({ g, iw, ih }) => {
    const all = [...series.values()].flat();
    const x = d3.scaleLinear().domain([1, d3.max(all, (d) => d.game_number)]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, d3.max(all, (d) => d.cumulative_wins)]).nice().range([ih, 0]);
    yGrid(g, y, iw, { ticks: 6 });
    xAxis(g, x, ih, { ticks: Math.min(10, iw / 60) });
    g.append("text").attr("class", "axis-title").attr("x", iw).attr("y", ih + 32).attr("text-anchor", "end").text("games played →");
    g.append("text").attr("class", "axis-title").attr("x", -32).attr("y", -6).text("wins");
    g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", iw).attr("y1", ih).attr("y2", ih);

    const line = d3.line().x((d) => x(d.game_number)).y((d) => y(d.cumulative_wins)).curve(d3.curveMonotoneX);
    const ids = [...series.keys()];
    const ghosts = g.append("g");
    ghosts.selectAll("path").data(ids.filter((id) => !pinned.has(id))).join("path")
      .attr("class", `ghost${pinned.size ? " dim" : ""}`).attr("d", (id) => line(series.get(id)));

    const hover = g.append("path").attr("class", "hl").attr("stroke", "var(--ink)").attr("stroke-width", 2).style("display", "none");

    const labelY = [];
    for (const id of pinned) {
      const s = series.get(id); if (!s) continue;
      const t = teams.get(id), c = teamInk(t);
      g.append("path").attr("class", "hl").attr("stroke", css("--paper")).attr("stroke-width", 6).attr("d", line(s));
      g.append("path").attr("class", "hl").attr("stroke", c).attr("d", line(s));
      const end = s.at(-1);
      labelY.push({ y: y(end.cumulative_wins), end: end.cumulative_wins, x: x(end.game_number), text: `${t.abbreviation} ${end.cumulative_wins}`, c });
    }
    // nudge end labels apart
    labelY.sort((a, b) => a.y - b.y).forEach((l, i, arr) => { if (i && l.y - arr[i - 1].y < 15) l.y = arr[i - 1].y + 15; });
    for (const l of labelY) {
      g.append("circle").attr("cx", l.x).attr("cy", y(l.end)).attr("r", 4).attr("fill", l.c).attr("stroke", css("--paper")).attr("stroke-width", 2);
      g.append("circle").attr("cx", l.x + 10).attr("cy", l.y).attr("r", 3.5).attr("fill", l.c);
      g.append("text").attr("class", "end-lbl").attr("x", l.x + 16).attr("y", l.y + 5).text(l.text);
    }

    // hover: nearest line under the pointer
    const pts = ids.flatMap((id) => series.get(id).map((d) => ({ id, d })));
    const delaunay = d3.Delaunay.from(pts, (p) => x(p.d.game_number), (p) => y(p.d.cumulative_wins));
    g.append("rect").attr("class", "hit").attr("width", iw).attr("height", ih)
      .on("pointermove", (e) => {
        const [mx, my] = d3.pointer(e);
        const p = pts[delaunay.find(mx, my)];
        const t = teams.get(p.id);
        hover.style("display", null).attr("stroke", teamInk(t)).attr("d", line(series.get(p.id)));
        showTip(`<b>${t.display_name}</b>${rows([["Game", p.d.game_number], ["Wins", p.d.cumulative_wins], ["Date", fmtDate(parseDate(p.d.game_date))], ["vs", `${p.d.opponent} ${p.d.points_for}–${p.d.points_against}`]])}<div class="row"><span>click to ${pinned.has(p.id) ? "unpin" : "pin"}</span></div>`, e);
        el.dataset.hoverId = p.id;
      })
      .on("pointerleave", () => { hover.style("display", "none"); hideTip(); })
      .on("click", () => el.dataset.hoverId && onToggle(Number(el.dataset.hoverId)));
  });
}

// ── horizontal bar list (top scorers) ────────────────────
export function barList(el, data, { value, label, sub, fmt = d3.format(".1f"), tip, href }) {
  const rowH = 26;
  return frame(el, data.length * rowH + 30, { top: 4, right: 44, bottom: 26, left: 0 }, ({ g, iw, ih }) => {
    const labelW = Math.min(190, iw * 0.42);
    const x = d3.scaleLinear().domain([0, d3.max(data, value)]).nice().range([0, iw - labelW]);
    const y = d3.scaleBand().domain(data.map((_, i) => i)).range([0, ih]).padding(0.28);
    const plot = g.append("g").attr("transform", `translate(${labelW},0)`);
    plot.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-ih).tickPadding(8))
      .call((a) => a.selectAll(".tick line").attr("stroke-dasharray", "1 3"));
    const row = g.selectAll(".r").data(data).join("g").attr("class", "r").attr("transform", (_, i) => `translate(0,${y(i)})`)
      .style("cursor", href ? "pointer" : null);
    row.append("text").attr("class", "lbl").attr("x", 0).attr("y", y.bandwidth() / 2 + 4)
      .style("font", "700 13px var(--f-body)").style("fill", "var(--ink)").text((d) => label(d))
      .append("tspan").attr("dx", 6).style("font", "400 11px var(--f-mono)").style("fill", "var(--ink-3)").text((d) => sub?.(d) ?? "");
    row.append("path").attr("fill", (_, i) => (i === 0 ? "var(--orange)" : "var(--ink)"))
      .attr("d", (d) => { const w = x(value(d)), h = y.bandwidth(), r = Math.min(4, w); return `M${labelW},0h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`; });
    row.append("text").attr("class", "val").attr("x", (d) => labelW + x(value(d)) + 6).attr("y", y.bandwidth() / 2 + 4).text((d) => fmt(value(d)));
    row.append("rect").attr("class", "hit").attr("x", 0).attr("y", -3).attr("width", iw + 40).attr("height", y.bandwidth() + 6)
      .on("pointermove", (e, d) => tip && showTip(tip(d), e)).on("pointerleave", hideTip)
      .on("click", (_, d) => { if (href) { hideTip(); location.hash = href(d); } });
    g.append("line").attr("class", "baseline").attr("x1", labelW).attr("x2", labelW).attr("y1", 0).attr("y2", ih);
  });
}

// ── scatter: volume vs efficiency, league medians as reference lines ──
export function scatter(el, data, { x: fx, y: fy, xTitle, yTitle, yFmt, highlight, colorOf, tip, href }) {
  return frame(el, (w) => Math.min(460, Math.max(300, w * 0.62)), { top: 18, right: 18, bottom: 40, left: 48 }, ({ g, iw, ih }) => {
    const x = d3.scaleLinear().domain(d3.extent(data, fx)).nice().range([0, iw]);
    const y = d3.scaleLinear().domain(d3.extent(data, fy)).nice().range([ih, 0]);
    yGrid(g, y, iw, { ticks: 6, fmt: yFmt });
    xAxis(g, x, ih, { ticks: Math.min(8, iw / 60) });
    g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", iw).attr("y1", ih).attr("y2", ih);
    g.append("text").attr("class", "axis-title").attr("x", iw).attr("y", ih + 34).attr("text-anchor", "end").text(`${xTitle} →`);
    g.append("text").attr("class", "axis-title").attr("x", -40).attr("y", -8).text(`↑ ${yTitle}`);

    const mx = d3.median(data, fx), my = d3.median(data, fy);
    g.append("line").attr("class", "ref").attr("x1", x(mx)).attr("x2", x(mx)).attr("y1", 0).attr("y2", ih);
    g.append("line").attr("class", "ref").attr("x1", 0).attr("x2", iw).attr("y1", y(my)).attr("y2", y(my));
    g.append("text").attr("class", "note").attr("x", iw - 4).attr("y", ih - 10).attr("text-anchor", "end").text("↘ high volume · inefficient");
    g.append("text").attr("class", "note").attr("x", iw - 4).attr("y", 4).attr("text-anchor", "end").text("high volume · efficient ↗");

    const sorted = [...data].sort((a, b) => highlight(a) - highlight(b));
    g.append("g").selectAll("circle").data(sorted).join("circle")
      .attr("cx", (d) => x(fx(d))).attr("cy", (d) => y(fy(d)))
      .attr("r", (d) => (highlight(d) ? 6 : 4.5))
      .attr("fill", (d) => (highlight(d) ? colorOf(d) : "var(--ghost)"))
      .attr("stroke", "var(--paper)").attr("stroke-width", 2);

    // label the top 3 scorers so the chart reads without hovering
    const labels = [...data].sort((a, b) => fx(b) - fx(a)).slice(0, 3)
      .map((d) => ({ d, x: x(fx(d)), y0: y(fy(d)), y: y(fy(d)) }))
      .sort((a, b) => a.y - b.y);
    // stack the labels in a column above the points, each with a leader line
    const top = Math.max(14, d3.min(labels, (l) => l.y0) - 18 - (labels.length - 1) * 14);
    labels.forEach((l, i) => { l.y = top + i * 14; });
    const lx = d3.min(labels, (l) => l.x) - 14;
    for (const l of labels) {
      g.append("path").attr("fill", "none").attr("stroke", "var(--ink-3)")
        .attr("d", `M${lx + 4},${l.y - 4}H${l.x}V${l.y0 - 6}`);
      g.append("text").attr("class", "val").attr("x", lx).attr("y", l.y).attr("text-anchor", "end")
        .text(l.d.player_name.split(" ").slice(-1)[0]);
    }

    const ring = g.append("circle").attr("r", 9).attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 2).style("display", "none");
    const delaunay = d3.Delaunay.from(data, (d) => x(fx(d)), (d) => y(fy(d)));
    g.append("rect").attr("class", "hit").attr("width", iw).attr("height", ih)
      .on("pointermove", (e) => {
        const [px, py] = d3.pointer(e);
        const d = data[delaunay.find(px, py)];
        ring.style("display", null).attr("cx", x(fx(d))).attr("cy", y(fy(d)));
        el.dataset.hoverId = d.player_id;
        showTip(tip(d), e);
      })
      .on("pointerleave", () => { ring.style("display", "none"); hideTip(); })
      .on("click", () => { const d = data.find((r) => r.player_id === Number(el.dataset.hoverId)); if (d && href) { hideTip(); location.hash = href(d); } })
      .style("cursor", href ? "pointer" : null);
  });
}

// ── per-game columns: margin (team) or points (player) ───
export function gameColumns(el, data, { value, color, yTitle, tip, dots }) {
  return frame(el, (w) => Math.min(340, Math.max(240, w * 0.38)), { top: 16, right: 12, bottom: 36, left: 40 }, ({ g, iw, ih }) => {
    const x = d3.scaleBand().domain(data.map((_, i) => i)).range([0, iw]).paddingInner(data.length > 40 ? 0.15 : 0.25);
    const vals = data.map(value).concat(dots ? data.map(dots.value) : []);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), Math.max(0, d3.max(vals))]).nice().range([ih, 0]);
    yGrid(g, y, iw, { ticks: 6 });
    const tickEvery = Math.ceil(data.length / Math.max(2, iw / 70));
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(data.map((_, i) => i).filter((i) => i % tickEvery === 0)).tickSize(0).tickPadding(10)
        .tickFormat((i) => fmtDate(parseDate(data[i].game_date))));
    g.append("text").attr("class", "axis-title").attr("x", -32).attr("y", -6).text(yTitle);

    const bw = x.bandwidth(), r = Math.min(3, bw / 2);
    g.append("g").selectAll("path").data(data).join("path").attr("fill", (d) => color(d))
      .attr("d", (d, i) => {
        const v = value(d), x0 = x(i), y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0);
        if (h < 0.5) return "";
        const rr = Math.min(r, h);
        return v >= 0
          ? `M${x0},${y0}V${y1 + rr}a${rr},${rr} 0 0 1 ${rr},-${rr}h${bw - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y0}z`
          : `M${x0},${y0}V${y1 - rr}a${rr},${rr} 0 0 0 ${rr},${rr}h${bw - 2 * rr}a${rr},${rr} 0 0 0 ${rr},-${rr}V${y0}z`;
      });
    if (dots) {
      g.append("path").attr("fill", "none").attr("stroke", dots.color).attr("stroke-width", 2)
        .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
        .attr("d", d3.line().x((_, i) => x(i) + bw / 2).y((d) => y(dots.value(d))).curve(d3.curveMonotoneX)(data));
      g.append("g").selectAll("circle").data(data).join("circle").attr("cx", (_, i) => x(i) + bw / 2).attr("cy", (d) => y(dots.value(d)))
        .attr("r", 4).attr("fill", dots.color).attr("stroke", "var(--paper)").attr("stroke-width", 2);
    }
    g.append("line").attr("class", "baseline").attr("x1", 0).attr("x2", iw).attr("y1", y(0)).attr("y2", y(0));

    const cross = g.append("line").attr("class", "cross").attr("y1", 0).attr("y2", ih).style("display", "none");
    g.append("g").selectAll("rect").data(data).join("rect").attr("class", "hit")
      .attr("x", (_, i) => x(i) - (x.step() - bw) / 2).attr("width", x.step()).attr("y", 0).attr("height", ih)
      .on("pointermove", (e, d) => { const i = data.indexOf(d); cross.style("display", null).attr("x1", x(i) + bw / 2).attr("x2", x(i) + bw / 2); showTip(tip(d), e); })
      .on("pointerleave", () => { cross.style("display", "none"); hideTip(); });
  });
}

export { rows as tipRows, fmtDate, parseDate };
