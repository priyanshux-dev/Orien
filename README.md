# 🚀 Orien.

**Your Autonomous AI Bug-Finding & Code-Proposal Agent 🐛🔍**

Welcome to **Orien**! 👋 Orien is a local-first developer tool built to eliminate the biggest headache in AI-assisted coding: **hallucinated fixes and noisy false positives.** ✨

With strict client-side token discipline, dual-tier model routing, and interactive dependency visualization, Orien scans your codebase, isolates real bugs with high precision, and lets you review, chat about, and apply verified patches directly to your local workspace—all while keeping your source code safely on your own machine! 🔒💻

---

## ✨ Key Features

- 🧠 **Dual-Tier Reasoning Engine**
  - **🌌 Orien Horizon (`30K` Input Cap):** Deep architectural scanning powered by **Gemini 4 Hydrogen**—built for multi-file bug discovery with **100% accuracy** on verified bug detection.
  - **⚡ Orien Carbon (`6K` Input Cap):** Fast, surgical patch generation powered by **DeepSeek V4.1 Flash** for rapid single-file fixes and quick iterations.
- 📊 **Live Token-Counting Meter:** Real-time visibility into your exact context usage with hard client-side token caps to keep scans fast, lean, and cost-efficient.
- 🕸️ **Import Dependency Graph:** Interactive module visualization to trace internal imports and catch cross-file ripple effects before touching a single line of code.
- 💬 **Proposal Chat with Active Memory:** Ask follow-up questions about why a fix was proposed, inspect caller/contract impacts, and refine patches interactively.
- 🛡️ **Safe Local Diff & Patch Controls:** Side-by-side diff previews, one-click `.patch` copy/export, direct local folder application, and full **Undo / Redo** rollback support.
- 📖 **Built-In Documentation:** Dedicated in-app docs page covering workflows, token budgets, and architecture.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS ⚛️🎨
- **Backend:** FastAPI, Python 🐍⚡

---

## 🚀 Quick Start (Local Setup)

Want to spin up Orien on your own machine? Follow these quick steps! 👇

### 1. Clone the Repository 📦

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
```

### 2. Start the FastAPI Backend 🐍

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file inside `backend/` and add your API keys:

```env
GEMINI_API_KEY=your_google_ai_studio_key
COARENA_API_KEY=your_coarena_key
```

Launch the backend server:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Start the Next.js Frontend ⚛️

Open a new terminal window and run:

```bash
cd frontend
npm install
npm run dev
```

Now open `http://localhost:3000` in your browser, pick a local project workspace, and start hunting bugs! 🎯

---

## 🌍 Proven in Real-World Open Source

Orien isn't just a toy benchmark—it's already shipping in production open source! 🛠️ Using Orien to scan active Python repositories, we've uncovered real bugs, verified fixes locally with `pytest` and `ruff`, and landed **merged pull requests in a 4K+ starred GitHub repository**! 🌟

---

## 🤝 Feedback & Contributions

Found a cool bug using Orien or have an idea to make it even better? Feel free to open an issue or reach out—happy coding! 🎉💻