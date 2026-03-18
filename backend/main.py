from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import random
import sqlite3
from datetime import datetime

# ─────────────────────────────────────────────────────
# GRID MIND AI — Backend Engine
# Team: 4685 | Energy-O-Thon 2026
# ─────────────────────────────────────────────────────

app = FastAPI(
    title="Grid Mind AI",
    description="Intelligent Energy. Zero Compromise.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────
# DATABASE SETUP
# ─────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect("gridmind.db")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS decisions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp     TEXT,
            deficit_mw    REAL,
            beta          REAL,
            hvac_shed     REAL,
            pump_shed     REAL,
            mill_shed     REAL,
            diesel_mw     REAL,
            total_cost    REAL,
            co2_tonnes    REAL,
            phase1_cost   REAL,
            phase2_cost   REAL,
            variant       TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ─────────────────────────────────────────────────────
# CONSTANTS — From Problem Statement (All locked)
# ─────────────────────────────────────────────────────
TOTAL_DEMAND    = 500.0   # MW
GRID_LIMIT      = 350.0   # MW
DIESEL_FUEL     = 150.0   # $/MWh
DIESEL_CO2      = 0.9     # t/MWh
ESG_PENALTY     = 90.0    # $/tonne
HVAC_MAX        = 20.0    # MW
HVAC_VOLL       = 150.0   # $/MWh  ($3000/hr ÷ 20MW)
PUMP_MAX        = 30.0    # MW
PUMP_VOLL       = 167.0   # $/MWh  ($5000/hr ÷ 30MW)
MILL_MAX        = 40.0    # MW
MILL_VOLL       = 375.0   # $/MWh  ($15000/hr ÷ 40MW)
WARMUP_HRS      = 5/60    # 5 min warm-up in hours
GAMMA           = 0.95    # DP discount factor
LAMBDA_SWITCH   = 50.0    # $/MW switching cost

# ─────────────────────────────────────────────────────
# BLOCK 2 — SENSOR SIMULATOR + 3-LAYER VALIDATOR
# ─────────────────────────────────────────────────────
SENSOR_LIMITS = {
    "solar_mw":   (0.0,  150.0),
    "wind_mw":    (0.0,  150.0),
    "grid_mw":    (0.0,  350.0),
    "hvac_mw":    (0.0,   20.0),
    "pump_mw":    (0.0,   30.0),
    "mill_mw":    (0.0,   40.0),
    "total_load": (400.0, 600.0),
}

SENSOR_DEFAULTS = {
    "solar_mw":   30.0,
    "wind_mw":    30.0,
    "grid_mw":    350.0,
    "hvac_mw":    18.0,
    "pump_mw":    28.0,
    "mill_mw":    38.0,
    "total_load": 500.0,
}

def simulate_sensors(failure_rate: float = 0.20) -> dict:
    """Simulate real IoT sensors with realistic failures"""
    base = {
        "solar_mw":   round(random.uniform(0, 60), 2),
        "wind_mw":    round(random.uniform(0, 90), 2),
        "grid_mw":    350.0,
        "hvac_mw":    round(random.uniform(15, 20), 2),
        "pump_mw":    round(random.uniform(25, 30), 2),
        "mill_mw":    round(random.uniform(35, 40), 2),
        "total_load": 500.0,
    }
    result = {}
    for key, val in base.items():
        roll = random.random()
        if roll < failure_rate * 0.4:
            result[key] = 0.0          # Dead sensor
        elif roll < failure_rate * 0.7:
            result[key] = round(random.uniform(999, 9999), 2)  # Spike
        elif roll < failure_rate:
            result[key] = val          # Frozen (same value repeated)
        else:
            result[key] = val          # Good sensor
    return result

def validate_sensors(raw: dict) -> tuple[dict, dict]:
    """
    3-Layer Validation (Block 2):
    Layer 1 — Range check
    Layer 2 — Cross validation
    Layer 3 — Conservative fallback
    """
    clean = {}
    flags = {}

    # Layer 1 — Range Validation
    for key, val in raw.items():
        lo, hi = SENSOR_LIMITS[key]
        if lo <= val <= hi:
            clean[key] = val
            flags[key] = "ok"
        else:
            clean[key] = SENSOR_DEFAULTS[key]
            flags[key] = "failed"

    # Layer 2 — Cross Validation
    # Total load should match grid + generation
    expected_total = clean["grid_mw"] + clean["solar_mw"] + clean["wind_mw"]
    if abs(clean["total_load"] - expected_total) > 100:
        clean["total_load"] = expected_total
        flags["total_load"] = "cross_corrected"

    # Layer 3 — Conservative: if still bad, use defaults
    for key in clean:
        lo, hi = SENSOR_LIMITS[key]
        if not (lo <= clean[key] <= hi):
            clean[key] = SENSOR_DEFAULTS[key]
            flags[key] = "fallback"

    return clean, flags

# ─────────────────────────────────────────────────────
# BLOCK 3 — MASTER LOSS FUNCTION (DP Formula)
# J*(s,t) = Σγᵗ{CCE×P + β×CO₂×90 + VoLL×Pshed + Γ×Risk + λ×Switch}
# ─────────────────────────────────────────────────────
def compute_loss(
    diesel_mw: float,
    hvac_shed: float,
    pump_shed: float,
    mill_shed: float,
    beta: float
) -> tuple[float, float, float, float]:
    """
    Returns: (total_cost, co2_tonnes, phase1_cost, phase2_cost)
    All units: $/hr normalized
    """
    phase2_hrs = 1.0 - WARMUP_HRS

    # Phase 1 (0-5 min) — Diesel cold, full shed mandatory
    phase1_cost = (
        hvac_shed * HVAC_VOLL +
        pump_shed * PUMP_VOLL +
        mill_shed * MILL_VOLL
    ) * WARMUP_HRS

    # CCE — Carbon Cost Equivalent (Beta weighted)
    cce_diesel = DIESEL_FUEL + beta * (DIESEL_CO2 * ESG_PENALTY)

    # Phase 2 Generation cost
    gen_cost = diesel_mw * cce_diesel * phase2_hrs

    # Phase 2 Load shed cost
    shed_cost = (
        hvac_shed * HVAC_VOLL +
        pump_shed * PUMP_VOLL +
        mill_shed * MILL_VOLL
    ) * phase2_hrs

    # CO2 tonnes emitted
    co2_tonnes = round(diesel_mw * DIESEL_CO2 * phase2_hrs, 2)

    # CO2 penalty (already in CCE but tracked separately for ESG)
    co2_cost = beta * co2_tonnes * ESG_PENALTY

    # Risk Penalty — Gamma based (warmup gap risk)
    risk_penalty = diesel_mw * MILL_VOLL * WARMUP_HRS

    # Switching Cost — Lambda term
    switch_cost = diesel_mw * LAMBDA_SWITCH

    # DP Discount applied to phase 2
    total = (
        phase1_cost
        + GAMMA * (gen_cost + shed_cost + co2_cost)
        + risk_penalty
        + switch_cost
    )

    return round(total, 2), co2_tonnes, round(phase1_cost, 2), round(GAMMA * (gen_cost + shed_cost + co2_cost), 2)

def find_optimal_dispatch(deficit_mw: float, beta: float) -> dict:
    """
    VoLL-ranked DP optimization:
    HVAC($150) < Pump($167) < Diesel(CCE) < Mill($375)
    Try all combinations — pick minimum J*
    """
    best_cost = float('inf')
    best      = {}

    hvac_options = [0.0, min(HVAC_MAX, deficit_mw)]
    for hvac in hvac_options:
        rem1 = max(0.0, deficit_mw - hvac)
        pump_options = [0.0, min(PUMP_MAX, rem1)]
        for pump in pump_options:
            rem2 = max(0.0, rem1 - pump)
            mill_options = [0.0, min(MILL_MAX, rem2)]
            for mill in mill_options:
                diesel = max(0.0, rem2 - mill)
                loss, co2, p1, p2 = compute_loss(diesel, hvac, pump, mill, beta)
                if loss < best_cost:
                    best_cost = loss
                    best = {
                        "hvac_shed":   hvac,
                        "pump_shed":   pump,
                        "mill_shed":   mill,
                        "diesel_mw":   round(diesel, 2),
                        "total_cost":  loss,
                        "co2_tonnes":  co2,
                        "phase1_cost": p1,
                        "phase2_cost": p2,
                    }

    # Variant label
    if best["diesel_mw"] == 0:
        variant = "B — Full Shed (Zero CO₂)"
    elif best["diesel_mw"] > 0 and (best["hvac_shed"] > 0 or best["pump_shed"] > 0):
        variant = "C — Smart Mix (Optimal)"
    else:
        variant = "A — Pure Diesel"

    best["variant"] = variant
    return best

# ─────────────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "system": "Grid Mind AI",
        "tagline": "Intelligent Energy. Zero Compromise.",
        "team": "4685",
        "status": "Online ⚡"
    }

@app.get("/sensor-data")
def get_sensor_data():
    raw   = simulate_sensors(failure_rate=0.20)
    clean, flags = validate_sensors(raw)
    res_mw  = clean["solar_mw"] + clean["wind_mw"]
    deficit = max(0.0, TOTAL_DEMAND - GRID_LIMIT - res_mw)
    failed  = sum(1 for f in flags.values() if f != "ok")
    return {
        "raw_sensors":    raw,
        "clean_sensors":  clean,
        "sensor_flags":   flags,
        "failed_sensors": failed,
        "res_generation": round(res_mw, 1),
        "deficit_mw":     round(deficit, 1),
        "grid_mw":        GRID_LIMIT,
        "total_demand":   TOTAL_DEMAND,
        "timestamp":      datetime.now().isoformat(),
    }

@app.post("/dispatch")
def run_dispatch(deficit_mw: float = 90.0, beta: float = 1.0):
    if deficit_mw < 0 or deficit_mw > 90:
        deficit_mw = max(0.0, min(90.0, deficit_mw))
    if beta < 0.5 or beta > 5.0:
        beta = max(0.5, min(5.0, beta))

    result = find_optimal_dispatch(deficit_mw, beta)
    result["beta"]       = beta
    result["deficit_mw"] = deficit_mw

    # Save to DB
    conn = sqlite3.connect("gridmind.db")
    conn.execute("""
        INSERT INTO decisions
        (timestamp, deficit_mw, beta, hvac_shed, pump_shed,
         mill_shed, diesel_mw, total_cost, co2_tonnes,
         phase1_cost, phase2_cost, variant)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        datetime.now().isoformat(),
        deficit_mw, beta,
        result["hvac_shed"], result["pump_shed"],
        result["mill_shed"], result["diesel_mw"],
        result["total_cost"], result["co2_tonnes"],
        result["phase1_cost"], result["phase2_cost"],
        result["variant"]
    ))
    conn.commit()
    conn.close()
    return result

@app.get("/pareto")
def get_pareto():
    points = []
    for b in np.arange(0.5, 5.5, 0.5):
        r = find_optimal_dispatch(90.0, float(b))
        points.append({
            "beta":    round(float(b), 1),
            "cost":    r["total_cost"],
            "co2":     r["co2_tonnes"],
            "variant": r["variant"],
        })
    return {"pareto_points": points}

@app.get("/history")
def get_history():
    conn = sqlite3.connect("gridmind.db")
    rows = conn.execute(
        "SELECT * FROM decisions ORDER BY id DESC LIMIT 20"
    ).fetchall()
    conn.close()
    cols = [
        "id","timestamp","deficit_mw","beta",
        "hvac_shed","pump_shed","mill_shed","diesel_mw",
        "total_cost","co2_tonnes","phase1_cost","phase2_cost","variant"
    ]
    return {"history": [dict(zip(cols, r)) for r in rows]}

@app.get("/summary")
def get_summary():
    conn = sqlite3.connect("gridmind.db")
    row = conn.execute("""
            SELECT
            COUNT(*)           as total_decisions,
            SUM(co2_tonnes)    as total_co2,
            SUM(total_cost)    as total_cost,
            AVG(total_cost)    as avg_cost,
            MIN(total_cost)    as best_cost
        FROM decisions
    """).fetchone()
    conn.close()
    return {
        "total_decisions": row[0],
        "total_co2_tonnes": round(row[1] or 0, 2),
        "total_cost_usd":   round(row[2] or 0, 2),
        "avg_cost_usd":     round(row[3] or 0, 2),
        "best_cost_usd":    round(row[4] or 0, 2),
    }