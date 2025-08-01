# 📚 PaperLens: Charting Research Trajectories and Academic Linkages

PaperLens is an open-source science mapping tool that helps researchers, analysts, and policymakers visualize research trends, citation dynamics, and publishing patterns using real-time data. It integrates topic modeling, citation network analysis, and venue profiling in a single, interactive dashboard—no coding required.

---

## 🚀 Features

- 🔍 **Real-time Metadata Scraping**  
  Uses **Semantic Scholar** and **OpenAlex** APIs to fetch up-to-date publication metadata on-demand.

- 🧠 **Automated Topic Modeling**  
  Uses **BERTopic** with **SPECTER2** embeddings and **HDBSCAN** clustering to identify thematic trends in literature.

- 🧬 **Citation Network Analysis**  
  Interactive citation graphs using **Temporal PageRank** and **Leiden** community detection algorithms.

- 📊 **Venue and Publisher Profiling**  
  Dashboard with OA (Open Access) status, venue types, publisher distributions, and index coverage (e.g., PubMed, arXiv).

- 🌐 **Interactive Visualizations**  
  Built with **PyVis**, **Dash**, and **Plotly**—enabling intuitive exploration without technical expertise.

---

## 🛠️ Tech Stack

- **Python**, **Dash**, **Plotly**, **PyVis**
- **BERTopic**, **SPECTER2**, **HDBSCAN**, **UMAP**
- **NetworkX**, **spaCy**, **Optuna**
- **Semantic Scholar API**, **OpenAlex API**

---

## 📂 Project Structure

PaperLens/
│
├── data/ # JSON files, processed metadata, and embeddings
├── models/ # BERTopic & SPECTER2 models
├── visualizations/ # Citation networks, trend maps, venue plots
├── app.py # Main Dash dashboard
├── citation_analysis.py # Temporal PageRank and Leiden clustering
├── trend_analysis.py # Topic modeling & co-word network generation
├── venue_analysis.py # Venue profiling logic
├── requirements.txt # Dependencies
└── README.md


---

## 📈 Sample Use Case

> **Example Query:** `"AI in phishing"`, Year: 2023  
> 
> - ✅ 300 papers fetched via APIs  
> - 🔍 17 research themes identified  
> - 🕸️ Citation network revealed key bridges  
> - 📊 arXiv was top publisher, 53% papers were Open Access

---

## 📦 Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/PaperLens.git
cd PaperLens

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt
