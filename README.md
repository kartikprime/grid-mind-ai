# ⚡ Grid Mind AI
### Intelligent Energy. Zero Compromise.
**Team ID: 4685 | Energy-O-Thon 2026**

---

## What is Grid Mind AI?
AI-powered real-time energy dispatch optimization system for large industrial clusters. Automatically balances renewable energy, grid supply, and load shedding to minimize financial losses and CO₂ emissions.

---

## Features
- ⚡ Real-time IoT sensor simulation with 3-layer fault detection
- 🧠 Dynamic Programming loss minimization formula
- 🌱 ESG-weighted (β) dispatch decisions  
- 📈 Pareto frontier visualization (Cost vs CO₂)
- 📋 Immutable ESG audit log
- 🔄 Auto-refresh every 5 seconds

---

## Tech Stack
| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLite |
| Frontend | React, Vite, Recharts |
| Algorithm | Dynamic Programming + VoLL optimization |
| Deploy | GitHub + Render + Vercel |

---

## Loss Function
```
J*(s,t) = Σγᵗ { CCE×P + β×CO₂×90 + VoLL×Pshed + Γ×Risk + λ×Switch }
```

## Run Locally

### Backend:
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy numpy pandas scipy
uvicorn main:app --reload --port 8000
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## Live Demo
- Frontend: Coming soon (Vercel)
- Backend API: Coming soon (Render)
- API Docs: /docs

---

*Energy-O-Thon 2026 | Team 4685 | Grid Mind AI*
```

**Ctrl+S save karo — phir:**
```
git add README.md
git commit -m "Add README"
git push origin main