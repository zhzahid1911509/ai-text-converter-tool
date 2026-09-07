# AI Text Converter Pro 🚀

**Convert raw AI text from ChatGPT, Gemini, Claude, and DeepSeek into beautiful, professional PDF & Word documents instantly.**

![GitHub Stars](https://img.shields.io/github/stars/ai-text-converter/ai-text-converter-pro?style=social)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-Active-success)
![Build](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

---

### 📖 Overview

Tired of messy formatting, broken tables, erased formulas, scrambled markdown, or stripped languages (such as **Bangla (বাংলা)**, Arabic, Hindi, and Emojis) when copying long answers from large language models? 

**AI Text Converter Pro** is a lightweight, 100% secure, browser-based formatting engine that parses any raw AI chat text, identifies Markdown, HTML, CSV, LaTeX equations, tables, and flowcharts, and generates perfectly typeset **PDF** and **Word (.docx)** documents with pixel-perfect typography.

Everything executes **locally inside your web browser** under strict client-side rendering. No data is ever uploaded to a server!

---

### ✨ Core Features

* **🧠 Smart Markdown & Structure Auto-Repair**  
  Automatically detects broken lists, bare markdown tables, CSV/TSV data, HTML artifacts (like "Copy code" buttons), en-dashes, and smart quotes, and reconstructs them into clean markdown syntax.
* **📝 Universal Unicode & Language Support**  
  Fully supports all international scripts including **Bangla (বাংলা), Hindi, Arabic, Chinese, Japanese, Korean, and Emojis (✅, ❌, 🚀)** with native complex-script shaping (no stripped ligatures or formatting errors).
* **📊 Multiple Table Formats Supported**  
  Automatically converts standard Markdown, HTML tables (with rowspans, colspans, and merged cells), CSV, TSV, Semicolon separators, fixed-width ANSI grids, and text tables into professional document grids with header highlighting and zebra shading.
* **🧮 Advanced Mathematical Equation Rendering**  
  Converts LaTeX math syntax ($$c = \pm\sqrt{a^2 + b^2}$$) and complex environmental brackets (`\[...\]`, `\begin{align}...\end{align}`) into authentic vector-quality typesettings in previews and documents.
* **📈 Live Visual Diagrams (Flowcharts & Mermaid)**  
  Renders Mermaid syntax into beautiful SVG flowcharts, state diagrams, sequence maps, and Gantt charts in real-time directly in your finished PDF/Word documents.
* **🖋️ Syntax Highlighting**  
  Automatically detects and formats coding blocks across 30+ languages (Python, TypeScript, Java, C++, SQL, Bash, etc.) with gorgeous high-contrast backgrounds.
* **🔒 Local-First Security & Privacy**  
  Executes only local static assets inside your web browser. Zero data tracking, zero cookies, no signups, fully secure operating environment.

---

### 🛠️ Technical Stack

| Category | Technology |
| :--- | :--- |
| **Framework / Syntax** | HTML5, CSS3 (Graphic Styles / Flexbox & Grid), Vanilla ES6+ |
| **Document Export** | jspdf.js, jspdf-autotable.js, docx.js, html2canvas.js |
| **Parsing & Math** | marked.js, turndown.js, dompurify.js, KaTeX |
| **Code & Visuals** | highlight.js, Mermaid.js (sequence & state charts) |
| **Typography** | Noto Sans Bengali, Hind Siliguri, Inter, JetBrains Mono |

---

### 🎯 How to Use (Getting Started)

1. **Input your Content:**
   * Copy any answer directly from popular AI interfaces (ChatGPT, Claude, Gemini, Perplexity, DeepSeek).
   * Paste it directly into the **AI Text Input Editor** container.
2. **Preview & Verify:**
   * Check formatted code blocks, tables, bold text, and equations in the Live Preview Panel.
   * Use `F` to enable Fullscreen mode or `Esc` to return to side-by-side view.
3. **Adjust Export Preferences:**
   * Toggle settings such as paper size (A4 / Letter), margin types, accent colors, font selections (Bangla / Sans / Serif), numbering, header lines, date stamps, and cover pages.
4. **Download Your Professional Document:**
   * Hit **Download PDF** or **Download DOCX**.
   * Your freshly organized file will download straight to your computer!

---

### 🔴 Live Link
https://ai-text-converter-pro.netlify.app/
