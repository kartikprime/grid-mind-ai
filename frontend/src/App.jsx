import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend
} from "recharts";

const API = "http://127.0.0.1:8000";

const COLORS = {
  bg:      "#020818",
  card:    "#0a1628",
  border:  "#0e2a4a",
  accent:  "#00d4ff",
  green:   "#00ff88",
  red:     "#ff4444",
  yellow:  "#ffd700",
  orange:  "#ff8c00",
  muted:   "#4a6080",
  text:    "#e2e8f0",
  textDim: "#64748b",
};

function StatCard({ label, value, unit, color, glow }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${glow ? color : COLORS.border}`,
      borderRadius: "12px",
      padding: "16px 20px",
      boxShadow: glow ? `0 0 18px ${color}33` : "none",
      transition: "all 0.3s ease",
    }}>
      <div style={{ color: COLORS.textDim, fontSize: "11px",
                    textTransform: "uppercase", letterSpacing: "2px",
                    marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ color: color || COLORS.text,
                    fontSize: "26px", fontWeight: "700",
                    fontFamily: "monospace" }}>
        {value}
        <span style={{ fontSize: "13px", color: COLORS.textDim,
                       marginLeft: "4px" }}>{unit}</span>
      </div>
    </div>
  );
}

function SensorCard({ name, value, flag }) {
  const ok = flag === "ok";
  return (
    <div style={{
      background: COLORS.bg,
      border: `1px solid ${ok ? COLORS.border : COLORS.red}`,
      borderLeft: `3px solid ${ok ? COLORS.green : COLORS.red}`,
      borderRadius: "8px",
      padding: "12px",
      transition: "all 0.3s",
    }}>
      <div style={{ color: COLORS.textDim, fontSize: "10px",
                    textTransform: "uppercase", letterSpacing: "1px" }}>
        {name.replace("_", " ")}
      </div>
      <div style={{ color: COLORS.text, fontSize: "18px",
                    fontWeight: "700", fontFamily: "monospace",
                    margin: "4px 0" }}>
        {typeof value === "number" ? value.toFixed(1) : value}
      </div>
      <div style={{
        fontSize: "10px", fontWeight: "600",
        color: ok ? COLORS.green : COLORS.red,
        background: ok ? "#00ff8815" : "#ff444415",
        padding: "2px 8px", borderRadius: "20px",
        display: "inline-block"
      }}>
        {ok ? "● LIVE" : "✕ FAILED"}
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "16px",
      padding: "24px",
      marginBottom: "24px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        marginBottom: "20px",
        paddingBottom: "12px",
        borderBottom: `1px solid ${COLORS.border}`
      }}>
        <span style={{ fontSize: "20px" }}>{icon}</span>
        <span style={{
          color: COLORS.accent, fontSize: "12px", fontWeight: "700",
          textTransform: "uppercase", letterSpacing: "3px"
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [sensors,    setSensors]    = useState(null);
  const [dispatch,   setDispatch]   = useState(null);
  const [pareto,     setPareto]     = useState([]);
  const [history,    setHistory]    = useState([]);
  const [summary,    setSummary]    = useState(null);
  const [beta,       setBeta]       = useState(1.0);
  const [deficit,    setDeficit]    = useState(90);
  const [loading,    setLoading]    = useState(false);
  const [lastUpdate, setLastUpdate] = useState("");
  const [alert,      setAlert]      = useState("");

  const fetchSensors = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/sensor-data`);
      setSensors(r.data);
      setLastUpdate(new Date().toLocaleTimeString());
      if (r.data.deficit_mw > 50) {
        setAlert(`⚠️ HIGH DEFICIT DETECTED: ${r.data.deficit_mw} MW`);
      } else {
        setAlert("");
      }
    } catch {
      setAlert("❌ Backend connection lost!");
    }
  }, []);

  const fetchPareto = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/pareto`);
      setPareto(r.data.pareto_points);
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/history`);
      setHistory(r.data.history);
    } catch {}
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/summary`);
      setSummary(r.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchSensors();
    fetchPareto();
    fetchHistory();
    fetchSummary();
    const interval = setInterval(() => {
      fetchSensors();
      fetchHistory();
      fetchSummary();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSensors, fetchHistory, fetchSummary]);

  const runDispatch = async () => {
    setLoading(true);
    try {
      const r = await axios.post(
        `${API}/dispatch?deficit_mw=${deficit}&beta=${beta}`
      );
      setDispatch(r.data);
      await fetchHistory();
      await fetchSummary();
      await fetchPareto();
    } catch {
      setAlert("❌ Dispatch failed!");
    }
    setLoading(false);
  };

  const variantColor = (v) => {
    if (!v) return COLORS.muted;
    if (v.includes("Full Shed"))  return COLORS.green;
    if (v.includes("Smart Mix"))  return COLORS.accent;
    return COLORS.red;
  };

  return (
    <div style={{
      background: COLORS.bg,
      minHeight: "100vh",
      color: COLORS.text,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: "0",
    }}>

      {/* TOP NAV */}
      <div style={{
        background: `linear-gradient(135deg, #020818 0%, #0a1628 100%)`,
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "16px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "40px", height: "40px",
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.green})`,
            borderRadius: "10px",
            display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "20px"
          }}>⚡</div>
          <div>
            <div style={{
              fontWeight: "800", fontSize: "20px",
              background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.green})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}>
              GRID MIND AI
            </div>
            <div style={{ color: COLORS.textDim, fontSize: "11px",
                          letterSpacing: "2px" }}>
              INTELLIGENT ENERGY. ZERO COMPROMISE.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: COLORS.textDim, fontSize: "10px",
                          letterSpacing: "1px" }}>TEAM</div>
            <div style={{ color: COLORS.accent, fontWeight: "700",
                          fontFamily: "monospace" }}>4685</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: COLORS.textDim, fontSize: "10px",
                          letterSpacing: "1px" }}>LAST UPDATE</div>
            <div style={{ color: COLORS.green, fontWeight: "700",
                          fontFamily: "monospace", fontSize: "13px" }}>
              {lastUpdate || "--:--:--"}
            </div>
          </div>
          <div style={{
            background: "#00ff8820",
            border: `1px solid ${COLORS.green}`,
            color: COLORS.green, padding: "6px 16px",
            borderRadius: "20px", fontSize: "12px", fontWeight: "700"
          }}>
            ● LIVE
          </div>
        </div>
      </div>

      {/* ALERT BANNER */}
      {alert && (
        <div style={{
          background: alert.includes("HIGH") ? "#ff440020" : "#ff000020",
          border: `1px solid ${COLORS.red}`,
          color: COLORS.red, padding: "12px 32px",
          fontSize: "13px", fontWeight: "700",
          textAlign: "center", letterSpacing: "1px"
        }}>
          {alert}
        </div>
      )}

      <div style={{ padding: "32px", maxWidth: "1400px", margin: "0 auto" }}>

        {/* SUMMARY CARDS */}
        {summary && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "16px", marginBottom: "24px"
          }}>
            <StatCard label="Total Decisions"
              value={summary.total_decisions} unit=""
              color={COLORS.accent} glow />
            <StatCard label="Total CO₂"
              value={summary.total_co2_tonnes?.toFixed(1)} unit="tonnes"
              color={COLORS.yellow} />
            <StatCard label="Total Cost"
              value={`$${summary.total_cost_usd?.toFixed(0)}`} unit=""
              color={COLORS.orange} />
            <StatCard label="Avg Cost/Decision"
              value={`$${summary.avg_cost_usd?.toFixed(0)}`} unit="/hr"
              color={COLORS.text} />
            <StatCard label="Best Cost Found"
              value={`$${summary.best_cost_usd?.toFixed(0)}`} unit="/hr"
              color={COLORS.green} glow />
          </div>
        )}

        {/* SENSOR DATA */}
        <Section title="Live IoT Sensor Data" icon="📡">
          {sensors ? (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "12px", marginBottom: "16px"
              }}>
                {Object.entries(sensors.clean_sensors).map(([k, v]) => (
                  <SensorCard key={k} name={k} value={v}
                    flag={sensors.sensor_flags[k]} />
                ))}
              </div>
              <div style={{
                display: "flex", gap: "32px",
                padding: "12px 16px",
                background: COLORS.bg,
                borderRadius: "8px", flexWrap: "wrap"
              }}>
                <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                  RES Generation:
                  <b style={{ color: COLORS.green, marginLeft: "8px" }}>
                    {sensors.res_generation} MW
                  </b>
                </span>
                <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                  Grid Supply:
                  <b style={{ color: COLORS.accent, marginLeft: "8px" }}>
                    {sensors.grid_mw} MW
                  </b>
                </span>
                <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                  Total Demand:
                  <b style={{ color: COLORS.text, marginLeft: "8px" }}>
                    {sensors.total_demand} MW
                  </b>
                </span>
                <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                  Deficit:
                  <b style={{
                    color: sensors.deficit_mw > 0 ? COLORS.red : COLORS.green,
                    marginLeft: "8px"
                  }}>
                    {sensors.deficit_mw} MW
                  </b>
                </span>
                <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                  Failed Sensors:
                  <b style={{
                    color: sensors.failed_sensors > 0 ? COLORS.yellow : COLORS.green,
                    marginLeft: "8px"
                  }}>
                    {sensors.failed_sensors} / 7
                  </b>
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: COLORS.textDim, textAlign: "center",
                          padding: "40px" }}>
              Connecting to sensors...
            </div>
          )}
        </Section>

        {/* DISPATCH CONTROLS */}
        <Section title="AI Dispatch Controls" icon="🧠">
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "32px", alignItems: "end"
          }}>
            <div>
              <div style={{ color: COLORS.textDim, fontSize: "12px",
                            letterSpacing: "1px", marginBottom: "12px" }}>
                POWER DEFICIT
                <span style={{ color: COLORS.red, fontSize: "20px",
                               fontWeight: "700", fontFamily: "monospace",
                               marginLeft: "12px" }}>
                  {deficit} MW
                </span>
              </div>
              <input type="range" min="10" max="90" value={deficit}
                onChange={e => setDeficit(Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.red }} />
              <div style={{ display: "flex", justifyContent: "space-between",
                            color: COLORS.textDim, fontSize: "11px",
                            marginTop: "4px" }}>
                <span>10 MW</span><span>90 MW</span>
              </div>
            </div>
            <div>
              <div style={{ color: COLORS.textDim, fontSize: "12px",
                            letterSpacing: "1px", marginBottom: "12px" }}>
                ESG WEIGHT (β)
                <span style={{
                  color: beta >= 3 ? COLORS.green : COLORS.accent,
                  fontSize: "20px", fontWeight: "700",
                  fontFamily: "monospace", marginLeft: "12px"
                }}>
                  {beta.toFixed(1)}
                  <span style={{ fontSize: "12px", marginLeft: "4px" }}>
                    {beta >= 3 ? "ESG MODE" : "NORMAL"}
                  </span>
                </span>
              </div>
              <input type="range" min="0.5" max="5" step="0.5" value={beta}
                onChange={e => setBeta(Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.green }} />
              <div style={{ display: "flex", justifyContent: "space-between",
                            color: COLORS.textDim, fontSize: "11px",
                            marginTop: "4px" }}>
                <span>β=0.5 Cost Priority</span>
                <span>β=5.0 ESG Priority</span>
              </div>
            </div>
            <button onClick={runDispatch} disabled={loading}
              style={{
                background: loading
                  ? COLORS.muted
                  : `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.green})`,
                color: "#000", border: "none",
                padding: "16px 36px", borderRadius: "12px",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "14px", fontWeight: "800",
                letterSpacing: "1px",
                boxShadow: loading ? "none" : `0 0 24px ${COLORS.accent}44`,
                transition: "all 0.3s",
                whiteSpace: "nowrap"
              }}>
              {loading ? "⏳ OPTIMIZING..." : "⚡ RUN AI DISPATCH"}
            </button>
          </div>
        </Section>

        {/* DISPATCH RESULT */}
        {dispatch && (
          <Section title={`Optimal Decision — ${dispatch.variant}`} icon="✅">
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "12px", marginBottom: "16px"
            }}>
              {[
                ["HVAC Shed",    `${dispatch.hvac_shed} MW`,              COLORS.accent],
                ["Pump Shed",    `${dispatch.pump_shed} MW`,              COLORS.accent],
                ["Mill Shed",    `${dispatch.mill_shed} MW`,              COLORS.yellow],
                ["Diesel Used",  `${dispatch.diesel_mw?.toFixed(1)} MW`,  COLORS.red],
                ["Phase 1 Cost", `$${dispatch.phase1_cost?.toFixed(0)}`,  COLORS.textDim],
                ["Phase 2 Cost", `$${dispatch.phase2_cost?.toFixed(0)}`,  COLORS.textDim],
                ["Total Cost",   `$${dispatch.total_cost?.toFixed(0)}/hr`,COLORS.green],
              ].map(([label, val, color]) => (
                <div key={label} style={{
                  background: COLORS.bg, borderRadius: "10px",
                  padding: "14px", textAlign: "center",
                  border: `1px solid ${COLORS.border}`
                }}>
                  <div style={{ color: COLORS.textDim, fontSize: "10px",
                                marginBottom: "6px", textTransform: "uppercase",
                                letterSpacing: "1px" }}>
                    {label}
                  </div>
                  <div style={{ color, fontSize: "18px",
                                fontWeight: "700", fontFamily: "monospace" }}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              display: "flex", gap: "24px", padding: "12px 16px",
              background: COLORS.bg, borderRadius: "8px", flexWrap: "wrap"
            }}>
              <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                CO₂ Emitted:
                <b style={{ color: COLORS.yellow, marginLeft: "8px" }}>
                  {dispatch.co2_tonnes} tonnes
                </b>
              </span>
              <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                β Weight:
                <b style={{ color: COLORS.accent, marginLeft: "8px" }}>
                  {dispatch.beta}
                </b>
              </span>
              <span style={{ color: COLORS.textDim, fontSize: "13px" }}>
                Deficit Covered:
                <b style={{ color: COLORS.green, marginLeft: "8px" }}>
                  {dispatch.deficit_mw} MW ✓
                </b>
              </span>
            </div>
          </Section>
        )}

        {/* CHARTS ROW */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px", marginBottom: "24px"
        }}>

          {/* Pareto Chart */}
          <Section title="Pareto Frontier — Cost vs CO₂" icon="📈">
            <ResponsiveContainer width="100%" height={260}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3"/>
                <XAxis dataKey="cost" name="Cost" stroke={COLORS.textDim}
                  fontSize={11}
                  label={{ value: "Cost ($/hr)", position: "insideBottom",
                           offset: -5, fill: COLORS.textDim, fontSize: 11 }}/>
                <YAxis dataKey="co2" name="CO₂" stroke={COLORS.textDim}
                  fontSize={11}
                  label={{ value: "CO₂ (t)", angle: -90,
                           position: "insideLeft",
                           fill: COLORS.textDim, fontSize: 11 }}/>
                <Tooltip
                  cursor={{ stroke: COLORS.accent, strokeWidth: 1 }}
                  contentStyle={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "8px", fontSize: "12px",
                    color: COLORS.text
                  }}
                  formatter={(val, name) => [
                    name === "Cost" ? `$${val}` : `${val}t`, name
                  ]}
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? `β=${payload[0].payload.beta} | ${payload[0].payload.variant}`
                      : ""
                  }
                />
                <Scatter
                  data={pareto}
                  fill={COLORS.accent}
                  shape={(props) => {
                    const { cx, cy, payload } = props;
                    const color = payload.variant.includes("Full Shed")
                      ? COLORS.green
                      : COLORS.accent;
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={8}
                          fill={color}
                          stroke={COLORS.bg} strokeWidth={2}/>
                        <text x={cx} y={cy - 14}
                          textAnchor="middle"
                          fill={color} fontSize={9}
                          fontFamily="monospace">
                          β={payload.beta}
                        </text>
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ display: "flex", gap: "20px",
                          justifyContent: "center", marginTop: "8px" }}>
              <span style={{ fontSize: "11px", color: COLORS.accent }}>
                ● Smart Mix (Cost Priority)
              </span>
              <span style={{ fontSize: "11px", color: COLORS.green }}>
                ● Full Shed (ESG Priority)
              </span>
            </div>
          </Section>

          {/* Cost Breakdown Bar Chart */}
          <Section title="Decision Cost Breakdown" icon="📊">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={history.slice(0, 8).reverse()}>
                  <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3"/>
                  <XAxis dataKey="timestamp" stroke={COLORS.textDim}
                    fontSize={10}
                    tickFormatter={(v) => v?.slice(11, 16)}/>
                  <YAxis stroke={COLORS.textDim} fontSize={11}/>
                  <Tooltip
                    contentStyle={{
                      background: COLORS.card,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "8px", fontSize: "12px",
                      color: COLORS.text
                    }}
                    formatter={(val) => [`$${val?.toFixed(0)}`, "Cost"]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px",
                                          color: COLORS.textDim }}/>
                  <Bar dataKey="total_cost" name="Total Cost $/hr"
                    radius={[4, 4, 0, 0]}>
                    {history.slice(0, 8).reverse().map((entry, i) => (
                      <Cell key={i} fill={variantColor(entry.variant)}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ color: COLORS.textDim, textAlign: "center",
                            padding: "80px 0", fontSize: "13px" }}>
                Run a dispatch to see cost history
              </div>
            )}
          </Section>
        </div>

        {/* ESG AUDIT LOG */}
        <Section title="ESG Audit Log — Decision History" icon="📋">
          {history.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%",
                              borderCollapse: "collapse",
                              fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {["Time","Deficit","β","HVAC","Pump","Mill",
                      "Diesel","P1 Cost","P2 Cost","Total",
                      "CO₂","Variant"].map(h => (
                      <th key={h} style={{
                        padding: "10px 12px", textAlign: "left",
                        color: COLORS.textDim, fontWeight: "600",
                        fontSize: "10px", textTransform: "uppercase",
                        letterSpacing: "1px"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, i) => (
                    <tr key={row.id} style={{
                      borderBottom: `1px solid ${COLORS.border}20`,
                      background: i % 2 === 0 ? "transparent" : "#ffffff05",
                    }}>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.textDim,
                                   fontFamily: "monospace" }}>
                        {row.timestamp?.slice(11, 19)}
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.red,
                                   fontFamily: "monospace" }}>
                        {row.deficit_mw} MW
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: row.beta >= 3
                                     ? COLORS.green : COLORS.accent,
                                   fontFamily: "monospace" }}>
                        {row.beta}
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.accent,
                                   fontFamily: "monospace" }}>
                        {row.hvac_shed} MW
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.accent,
                                   fontFamily: "monospace" }}>
                        {row.pump_shed} MW
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.yellow,
                                   fontFamily: "monospace" }}>
                        {row.mill_shed} MW
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: row.diesel_mw > 0
                                     ? COLORS.red : COLORS.green,
                                   fontFamily: "monospace" }}>
                        {row.diesel_mw?.toFixed(1)} MW
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.textDim,
                                   fontFamily: "monospace" }}>
                        ${row.phase1_cost?.toFixed(0)}
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.textDim,
                                   fontFamily: "monospace" }}>
                        ${row.phase2_cost?.toFixed(0)}
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.green,
                                   fontFamily: "monospace",
                                   fontWeight: "700" }}>
                        ${row.total_cost?.toFixed(0)}
                      </td>
                      <td style={{ padding: "10px 12px",
                                   color: COLORS.yellow,
                                   fontFamily: "monospace" }}>
                        {row.co2_tonnes?.toFixed(1)}t
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: `${variantColor(row.variant)}20`,
                          color: variantColor(row.variant),
                          padding: "3px 10px", borderRadius: "20px",
                          fontSize: "10px", fontWeight: "700",
                          whiteSpace: "nowrap"
                        }}>
                          {row.variant}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: COLORS.textDim, textAlign: "center",
                          padding: "40px", fontSize: "13px" }}>
              No decisions yet — Run AI Dispatch to populate log
            </div>
          )}
        </Section>

        {/* FOOTER */}
        <div style={{
          textAlign: "center", padding: "24px 0",
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.textDim, fontSize: "12px"
        }}>
          <span style={{ color: COLORS.accent, fontWeight: "700" }}>
            GRID MIND AI
          </span>
          {" "}— Team 4685 | Energy-O-Thon 2026 |
          Intelligent Energy. Zero Compromise. ⚡
        </div>

      </div>
    </div>
  );
}