from motor.motor_asyncio import AsyncIOMotorClient
import pandas as pd
import numpy as np
import re
import json
import umap
import plotly.io as pio
import hdbscan
from bertopic import BERTopic
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from skopt import gp_minimize
from sentence_transformers import SentenceTransformer
import torch
import random
import multiprocessing
from sklearn.feature_extraction.text import CountVectorizer
from bertopic.vectorizers import ClassTfidfTransformer
from bertopic.representation import KeyBERTInspired
import optuna
import pandas as pd
import dash
from dash import dcc, html, Input, Output,State
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
import dash_bootstrap_components as dbc
from fastapi import  HTTPException, APIRouter, Request
from pydantic import BaseModel
import threading
import time
import webbrowser
import asyncio




# Set seed for reproducibility
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

if __name__ == "__main__":
    set_seed(42)
    multiprocessing.freeze_support()
    
global TitleName 
TitleName ="Dashboard"
router = APIRouter()

class TrendAnalysisRequest(BaseModel):
    userId: str
    topic: str
    year: str = None
    page: int = 0

async def fetch_papers_with_pagination(request:Request, userId: str, topic: str, year: str = None, page: int = 0):
    # Build the query filter
    query_filter = {"userId": userId, "topic": topic}
    if year:
        query_filter["year"] = year
    
    # Count total matching documents
    count_pipeline = [
        {"$match": query_filter},
        {"$unwind": "$papers"},
        {"$count": "total_papers"}
    ]
    collection = request.app.state.collection
    count_result = await collection.aggregate(count_pipeline).to_list(length=1)
    total_papers = count_result[0]['total_papers'] if count_result else 0
    
    print(f"Total papers matching criteria: {total_papers}")
    
    # If no papers found, return empty result
    if total_papers == 0:
        return pd.DataFrame(), 0, 0, 0, 0
    
    # Define pagination constants
    papers_per_page = 200
    min_papers_last_page = 50
    
    # Calculate basic pagination
    if total_papers <= papers_per_page:
        # Simple case: all papers fit in one page
        total_pages = 1
    else:
        # Multiple pages case
        full_pages = total_papers // papers_per_page
        remaining = total_papers % papers_per_page
        
        if remaining >= min_papers_last_page:
            # If remaining papers meet minimum threshold, create a separate page
            total_pages = full_pages + 1
        else:
            # Otherwise, we'll have exactly 'full_pages' pages
            # The remaining papers will be added to the last page
            total_pages = full_pages
    
    # Ensure page is within valid range
    if page >= total_pages:
        return pd.DataFrame(), 0, total_pages, 0, total_papers
    
    # Calculate skip and limit based on page number
    if total_pages == 1:
        # Only one page - return all papers
        skip = 0
        limit = total_papers
    elif page < total_pages - 1:
        # Regular full page
        skip = page * papers_per_page
        limit = papers_per_page
    else:
        # Last page - might include remaining papers
        remaining = total_papers % papers_per_page
        
        if remaining >= min_papers_last_page or remaining == 0:
            # Last page with either enough remaining papers or perfectly divided
            skip = page * papers_per_page
            limit = remaining if remaining > 0 else papers_per_page
        else:
            # Last page with remaining papers that don't meet minimum threshold
            # We distribute by adding them to the last page
            skip = (total_pages - 1) * papers_per_page
            limit = papers_per_page + remaining
    
    print(f"Pagination: Page {page+1} of {total_pages}, Skip {skip}, Limit {limit}")
    
    # MongoDB aggregation pipeline
    pipeline = [
        {"$match": query_filter},
        {"$unwind": "$papers"},
        {"$replaceRoot": {"newRoot": "$papers"}},
        {"$project": {
            "_id": 0,
            "paperId": 1,
            "url": 1,
            "title": 1,
            "abstract": 1,
            "citationCount": 1,
            "influentialCitationCount": 1,
            "embedding": 1,
            "publicationDate": 1,
            "authors": 1
        }},
        {"$sort": {"publicationDate": 1 }},
        {"$skip": skip},
        {"$limit": limit}
    ]
    
    # Execute the aggregation pipeline
    cursor = collection.aggregate(pipeline)
    papers = await cursor.to_list(None)
    
    papers_count = len(papers)
    print(f"Papers Retrieved: {papers_count}")
    
    # Convert to DataFrame
    df = pd.DataFrame(papers)
    df=df.sort_values(by="publicationDate")
    print(df[["paperId", "publicationDate"]].head(10))

    
    
    return df, page, total_pages, papers_count, total_papers

# Preprocessing function
def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    return ' '.join([word for word in text.split() if word not in ENGLISH_STOP_WORDS])

# Adaptive clustering and topic modeling
def perform_trend_analysis(df):
    # Convert embeddings
    def convert_embedding(embedding):
        return np.array(embedding["vector"], dtype=np.float64) if isinstance(embedding, dict) and "vector" in embedding else None

    df["embedding"] = df["embedding"].apply(convert_embedding)
    df = df.dropna(subset=["embedding"])
    
    if df.empty:
        return df, {}
        
    df["clean_text"] = (df["abstract"].fillna("")).apply(clean_text)

    def objective(trial):
        umap_n_components = trial.suggest_int("umap_n_components", 1, 12)
        umap_min_dist = trial.suggest_float("umap_min_dist", 0.1, 0.8)
        umap_n_neighbors = trial.suggest_int("umap_n_neighbors", 2, 12)
        hdbscan_min_cluster_size = trial.suggest_int("hdbscan_min_cluster_size", 2, 10)
        hdbscan_min_samples = trial.suggest_int("hdbscan_min_samples", 1, 10)
        hdbscan_cluster_selection_epsilon = trial.suggest_float("hdbscan_cluster_selection_epsilon", 0.2, 0.8)
        hdbscan_cluster_selection_method = trial.suggest_categorical("hdbscan_cluster_selection_method", ["eom", "leaf"])

        reducer_high_dim = umap.UMAP(
            n_components=umap_n_components,
            random_state=42,
            min_dist=umap_min_dist,
            n_neighbors=umap_n_neighbors,
            metric="cosine"
        )
        reduced_embeddings_high_dim = reducer_high_dim.fit_transform(np.vstack(df["embedding"].values)).astype(np.float64)

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=hdbscan_min_cluster_size,
            min_samples=hdbscan_min_samples,
            cluster_selection_epsilon=hdbscan_cluster_selection_epsilon,
            cluster_selection_method=hdbscan_cluster_selection_method,
            prediction_data=True,
            core_dist_n_jobs=1
        )
        labels = clusterer.fit_predict(reduced_embeddings_high_dim)

        if len(set(labels)) > 1:
            dbcv_score = hdbscan.validity.validity_index(reduced_embeddings_high_dim, labels)
        else:
            dbcv_score = -np.inf

        return dbcv_score

    study = optuna.create_study(
        direction="maximize",
        sampler=optuna.samplers.TPESampler(seed=42))
    study.optimize(objective, n_trials=100)
    
    best_params = study.best_params
    umap_model = umap.UMAP(
        n_components=best_params["umap_n_components"],
        random_state=42,
        min_dist=best_params["umap_min_dist"],
        n_neighbors=best_params["umap_n_neighbors"],
        metric="cosine"
    )
    hdbscan_model = hdbscan.HDBSCAN(
        min_cluster_size=best_params["hdbscan_min_cluster_size"],
        min_samples=best_params["hdbscan_min_samples"],
        cluster_selection_epsilon=best_params["hdbscan_cluster_selection_epsilon"],
        cluster_selection_method=best_params["hdbscan_cluster_selection_method"],
        prediction_data=True,
        core_dist_n_jobs=1
    )
    
    vectorizer = CountVectorizer(
        stop_words=list(ENGLISH_STOP_WORDS),
        ngram_range=(2, 3) 
    )
    
    representation_model = KeyBERTInspired()
    embedding_model = SentenceTransformer("allenai/specter")
    topic_model = BERTopic(
        vectorizer_model=vectorizer,
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        embedding_model=embedding_model,
        nr_topics='auto',
        top_n_words=8,
        representation_model=representation_model,
        ctfidf_model=ClassTfidfTransformer(reduce_frequent_words=False, bm25_weighting=True)
    )

    topics, _ = topic_model.fit_transform(df["clean_text"], np.vstack(df["embedding"].values))
    df["topic"] = topics
    topic_labels = {t: " | ".join([word for word, _ in topic_model.get_topic(t)][:8]) for t in set(topics)}

    reduced_embeddings_2d = umap.UMAP(n_components=2, random_state=42).fit_transform(np.vstack(df["embedding"].values)).astype(np.float64)
    df["x"] = reduced_embeddings_2d[:, 0]
    df["y"] = reduced_embeddings_2d[:, 1]
    df["topic_label"] = df["topic"].map(topic_labels)
    
    return df, topic_labels



def build_dashboard(df , titleNm,topic_year):
    TitleName = titleNm + "_" + topic_year
    color_palette = px.colors.qualitative.Vivid 
    unique_topics = sorted(df["topic"].unique())
    color_map = {topic: color_palette[i % len(color_palette)] for i, topic in enumerate(unique_topics)}

    # Map colors to topics
    df["color"] = df["topic"].map(color_map)

    # Calculate the number of papers in each cluster
    cluster_sizes = df.groupby("topic").size().reset_index(name="paper_count")
    df = df.merge(cluster_sizes, on="topic", how="left")

    # Improved marker scaling with a better range
    min_size = 50
    max_size = 140
    df["marker_size"] = ((df["paper_count"] - df["paper_count"].min()) / 
                        (df["paper_count"].max() - df["paper_count"].min())) * (max_size - min_size) + min_size

    # Add log-transformed citation and influence columns
    df["log_citation"] = np.log1p(df["citationCount"])
    df["log_influence"] = np.log1p(df["influentialCitationCount"])

    # Bayesian shrinkage for citations and influence
    global_median_citation = df["log_citation"].median()
    global_median_influence = df["log_influence"].median()
    C = 10  # Shrinkage constant

    def bayesian_shrinkage(group, global_median, C):
        return (group.sum() + C * global_median) / (len(group) + C)

    adjusted_citations = df.groupby("topic")["log_citation"].apply(lambda x: bayesian_shrinkage(x, global_median_citation, C))
    adjusted_influence = df.groupby("topic")["log_influence"].apply(lambda x: bayesian_shrinkage(x, global_median_influence, C))

    # Merge adjusted metrics back into the dataframe
    df = df.merge(adjusted_citations.rename("adjusted_citation"), on="topic")
    df = df.merge(adjusted_influence.rename("adjusted_influence"), on="topic")

    # Calculate global percentiles for thresholds
    citation_25th = df["adjusted_citation"].quantile(0.25)
    citation_75th = df["adjusted_citation"].quantile(0.75)
    influence_25th = df["adjusted_influence"].quantile(0.25)
    influence_75th = df["adjusted_influence"].quantile(0.75)

    # Enhanced theme classification with more distinct emojis
    def classify_theme(row):
        if row["adjusted_citation"] >= citation_75th and row["adjusted_influence"] >= influence_75th:
            return "🔥 Hot Topic"
        elif row["adjusted_citation"] <= citation_25th and row["adjusted_influence"] >= influence_75th:
            return "💎 Gap Opportunity"
        elif row["adjusted_citation"] >= citation_75th and row["adjusted_influence"] <= influence_25th:
            return "⚠️ Risky Theme"
        else:
            return "🔄 Neutral"

    df["theme"] = df.apply(classify_theme, axis=1)

    # Initialize the Dash app with an improved Bootstrap theme
    app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY])  # DARKLY for a sleek dark theme


    # Create a more visually appealing figure
    fig = go.Figure()

    # Add subtle grid lines for reference
    fig.update_xaxes(
        showgrid=True,
        gridwidth=0.1,
        gridcolor='rgba(255, 255, 255, 0.05)',
        zeroline=False
    )
    fig.update_yaxes(
        showgrid=True,
        gridwidth=0.1,
        gridcolor='rgba(255, 255, 255, 0.05)',
        zeroline=False
    )

    for topic in unique_topics:
        topic_data = df[df["topic"] == topic]
        
        # Get cluster center
        center_x = topic_data["x"].mean()
        center_y = topic_data["y"].mean()
        
        # Get label
        full_topic_formatted = topic_data['topic_label'].iloc[0] if 'topic_label' in topic_data.columns else f"Cluster {topic}"
        
        # Add a subtle glow effect with a larger outer circle
        fig.add_trace(
            go.Scatter(
                x=[center_x],
                y=[center_y],
                mode="markers",
                marker=dict(
                    color=color_map[topic],
                    size=topic_data["marker_size"].iloc[0] * 1.2,  # Slightly larger for glow effect
                    opacity=0.3,
                    line=dict(width=0),
                    symbol="circle",
                ),
                showlegend=False,
                hoverinfo="none",
            )
        )
        
        # Add main cluster circle with enhanced styling
        fig.add_trace(
            go.Scatter(
                x=[center_x],
                y=[center_y],
                mode="markers+text",
                marker=dict(
                    color=color_map[topic],
                    size=topic_data["marker_size"].iloc[0],
                    opacity=0.85,
                    line=dict(width=2, color="white"),
                    symbol="circle",
                ),
                text=[f"{topic}"],
                textposition="middle center",
                textfont=dict(
                    family="Arial Black",
                    size=16,
                    color="white"
                ),
                name=f"{topic}",
                hovertemplate=(
                    "<b>Cluster ID:</b> %{text}<br>" +
                    "<b>Name:</b><br>" + full_topic_formatted + "<br>" +
                    "<b>Papers:</b> " + str(topic_data["paper_count"].iloc[0]) + "<br>" +
                    "<b>Popularity:</b> " + ("🔼 High" if topic_data["adjusted_citation"].iloc[0] >= citation_75th else "🔽 Low") +
                    f" (Adjusted Citation: {topic_data['adjusted_citation'].iloc[0]:.2f})<br>" +
                    "<b>Impactfulness:</b> " + ("🔼 High" if topic_data["adjusted_influence"].iloc[0] >= influence_75th else "🔽 Low") +
                    f" (Adjusted Influence: {topic_data['adjusted_influence'].iloc[0]:.2f})<br>" +
                    "<b>Theme:</b> " + topic_data["theme"].iloc[0] +
                    "<extra></extra>"
                ),
                customdata=[[topic]],
            )
        )

    # Add an aesthetic background with gradient
    fig.update_layout(
        shapes=[
            # Improved gradient background
            dict(
                type="rect",
                xref="paper",
                yref="paper",
                x0=0,
                y0=0,
                x1=1,
                y1=1,
                fillcolor="rgba(0, 0, 40, 0.95)",
                line_width=0,
                layer="below"
            ),
            # Add a subtle radial gradient effect
            dict(
                type="circle",
                xref="paper",
                yref="paper",
                x0=0.3,
                y0=0.3,
                x1=0.7,
                y1=0.7,
                fillcolor="rgba(50, 50, 120, 0.2)",
                line_width=0,
                layer="below"
            )
        ],
        template="plotly_dark",
            title={
            'text': f"<b>{TitleName.title()}</b>",
            'y':0.97,
            'x':0.5,
            'xanchor': 'center',
            'yanchor': 'top',
            'font': dict(
                family="Arial Black",
                size=28,
                color="white",
            ),
            'xref': 'paper',
            'yref': 'paper',
        },
        margin=dict(l=40, r=40, b=150, t=100),
        hovermode="closest",
        xaxis=dict(showticklabels=False),
        yaxis=dict(showticklabels=False),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        dragmode="pan",
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=-0.15,
            xanchor="center",
            x=0.5,
            bgcolor="rgba(30,30,60,0.5)",
            bordercolor="rgba(255,255,255,0.2)",
            borderwidth=1
        ),
    )

    # Add subtle animation options
    fig.update_layout(
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                buttons=[
                    dict(
                        label="Reset View",
                        method="relayout",
                        args=[{"xaxis.range": None, "yaxis.range": None}]
                    ),
                ],
                x=0.05,
                y=0.05,
                xanchor="left",
                yanchor="bottom",
                bgcolor="rgba(50,50,80,0.7)",
                bordercolor="rgba(255,255,255,0.2)",
            )
        ]
    )

    # Enhanced app layout with modern design elements
    app.layout = dbc.Container(
        fluid=True,
        style={
            "backgroundColor": "#111122", 
            "minHeight": "100vh",
            "height": "100%",
            "width": "100%",
            "backgroundImage": "linear-gradient(135deg, #111122 0%, #15162c 100%)",
            "padding": "20px"
        },
        children=[
            dbc.Row([
                dbc.Col(html.H1(
                     "Trend Analysis Dashboard ", 
                    style={
                    "textAlign": "center", 
                    "color": "white", 
                    "marginBottom": "5px",
                    "fontFamily": "Arial Black",
                    "textShadow": "2px 2px 8px rgba(0,0,0,0.7)",
                    "letterSpacing": "2px",
                    "fontSize": "42px",
                    "background": "linear-gradient(135deg, #790091 0%, #565cd5 100%)",
                    "WebkitBackgroundClip": "text",
                    "WebkitTextFillColor": "transparent",
                    "paddingTop": "10px"
                }
                ), width=10),
                
                 dbc.Col([
                    html.Button(
                        [
                            html.I(className="fas fa-download mr-2"),
                            " Save Dashboard"
                        ],
                        id="download-button",
                        className="btn btn-outline-light",
                        style={
                            "marginTop": "10px",
                            "backgroundColor": "rgba(80, 80, 150, 0.4)",
                            "border": "1px solid rgba(100, 100, 200, 0.5)",
                            "borderRadius": "8px",
                            "padding": "8px 15px",
                            "boxShadow": "0px 4px 8px rgba(0, 0, 0, 0.3)",
                            "transition": "all 0.3s ease",
                            "fontSize": "14px",
                            "fontWeight": "bold"
                        }
                    ),
                    # Add the download component
                    dcc.Download(id="download-dashboard")
                ], width=2),
                
                dbc.Col(html.P(
                    "Interactive visualization of research topics and their relationships",
                    style={
                    "textAlign": "center", 
                    "color": "#aaddff", 
                    "marginBottom": "15px",
                    "fontStyle": "italic",
                    "fontSize": "16px",
                    "fontWeight": "300",
                    "letterSpacing": "0.5px",
                    "textShadow": "1px 1px 3px rgba(0,0,0,0.5)",
                }
                ), width=12),
            ]),
            
            dbc.Row([
                dbc.Col(
                    dbc.Card(
                        dbc.CardBody([
                            dcc.Graph(
                                id="cluster-graph", 
                                figure=fig,
                                config={
                                    "scrollZoom": True,
                                    "displayModeBar": True,
                                    "modeBarButtonsToRemove": ["select2d", "lasso2d"]
                                },style={"height": "80vh", "min-height": "800px"} 
                            )
                        ],style={"height": "80vh", "min-height": "800px"}),
                        style={
                            "backgroundColor": "rgba(20, 20, 40, 0.7)",
                            "borderRadius": "15px",
                            "boxShadow": "0px 10px 30px rgba(0, 0, 0, 0.5)",
                            "border": "1px solid rgba(100, 100, 200, 0.3)",
                            "height": "80vh",
                            "min-height": "800px"  # Ensure minimum height
                        }
                    ),
                    width=9
                ),
                
                dbc.Col(
                    dbc.Card(
                        dbc.CardBody([
                            html.H3("Paper List", style={
                                "textAlign": "center", 
                                "marginBottom": "15px",
                                "color": "#ffffff",
                                "fontFamily": "Arial",
                                "fontWeight": "bold",
                                "textShadow": "1px 1px 3px rgba(0,0,0,0.3)"
                            }),
                            html.Hr(style={"borderColor": "rgba(100, 100, 200, 0.3)", "margin": "10px 0 20px 0"}),
                            html.Div(
                                id="paper-list", 
                                style={
                                    "overflowY": "auto", 
                                    "height": "700px",
                                    "padding": "5px"
                                },
                                children=html.Div([
                                    html.Div(
                                        html.I(className="fas fa-mouse-pointer", style={"marginRight": "10px"}),
                                        style={"textAlign": "center", "fontSize": "24px", "marginBottom": "10px", "color": "#7f8fa6"}
                                    ),
                                    html.P("Click on a cluster to view its papers", 
                                        style={"textAlign": "center", "color": "#7f8fa6"})
                                ])
                            ),
                        ], 
                        style={
                            "backgroundColor": "rgba(30, 30, 50, 0.8)", 
                            "borderRadius": "15px", 
                            "padding": "20px",
                            "height": "100%"
                        }),
                        style={
                            "height": "800px",
                            "boxShadow": "0px 10px 30px rgba(0, 0, 0, 0.5)",
                            "border": "1px solid rgba(100, 100, 200, 0.3)",
                            "borderRadius": "15px"
                        }
                    ),
                    width=3
                ),
            ], style={"marginTop": "20px"}),
            
            # Add a footer with theme legend
            dbc.Row([
                dbc.Col(
                    dbc.Card(
                        dbc.CardBody([
                            html.H5("Theme Legend", style={"textAlign": "center", "marginBottom": "15px"}),
                            dbc.Row([
                                dbc.Col(html.Div([
                                    html.Span("🔥", style={"fontSize": "20px", "marginRight": "10px"}),
                                    "Hot Topic: High citations & high influence"
                                ]), width=3),
                                dbc.Col(html.Div([
                                    html.Span("💎", style={"fontSize": "20px", "marginRight": "10px"}),
                                    "Gap Opportunity: Low citations but high influence"
                                ]), width=3),
                                dbc.Col(html.Div([
                                    html.Span("⚠️", style={"fontSize": "20px", "marginRight": "10px"}),
                                    "Risky Theme: High citations but low influence"
                                ]), width=3),
                                dbc.Col(html.Div([
                                    html.Span("🔄", style={"fontSize": "20px", "marginRight": "10px"}),
                                    "Neutral: Average citations and influence"
                                ]), width=3),
                            ])
                        ]),
                        style={
                            "backgroundColor": "rgba(30, 30, 50, 0.8)",
                            "borderRadius": "15px",
                            "marginTop": "20px",
                            "boxShadow": "0px 5px 15px rgba(0, 0, 0, 0.3)",
                            "border": "1px solid rgba(100, 100, 200, 0.3)"
                        }
                    ),
                    width=12
                ),
                
            ] ),
            
          dcc.Store(id="stored-figure", data=fig)  
        ]
        
    )

    @app.callback(
        Output("download-dashboard", "data"),
        Input("download-button", "n_clicks"),
        State("cluster-graph", "figure"),
        prevent_initial_call=True
    )
    def download_dashboard(n_clicks, figure):
        if n_clicks is None:
            return None
            
        # Save the figure as HTML with full plotly.js included
        dashboard_html = pio.to_html(
            figure, 
            full_html=True,
            include_plotlyjs='cdn',
            config={'responsive': True}
        )
        
        # Return the dashboard as an HTML file
        return dict(
            content=dashboard_html,
            filename="research_dashboard.html",
            type="text/html",
        )
    # Enhanced callback to update paper list with better styling
    # Enhanced callback to update paper list with better styling
    @app.callback(
        Output("paper-list", "children"),
        [Input("cluster-graph", "clickData")]
    )
    def update_paper_list(clickData):
        if clickData is None:
            return html.Div([
                html.Div(
                    html.I(className="fas fa-mouse-pointer", style={"marginRight": "10px"}),
                    style={"textAlign": "center", "fontSize": "24px", "marginBottom": "10px", "color": "#7f8fa6"}
                ),
                html.P("Click on a cluster to view its papers", 
                    style={"textAlign": "center", "color": "#7f8fa6"})
            ])
        
        # Extract the clicked cluster ID
        try:
            clicked_topic = clickData["points"][0]["customdata"][0]
            
            # Get the color for this topic for styling consistency
            topic_color = color_map[clicked_topic]
            
            # Get the theme for this topic
            topic_theme = df[df["topic"] == clicked_topic]["theme"].iloc[0]
            
        except (KeyError, IndexError):
            return html.Div("Error retrieving cluster data.", style={"textAlign": "center", "marginTop": "20px"})
        
        # Filter papers in the clicked cluster - UPDATED to include titles AND urls
        papers_in_cluster = df[df["topic"] == clicked_topic][["title", "url", "paperId"]]
        
        if papers_in_cluster.empty:
            return html.Div(f"No papers found for Cluster {clicked_topic}.", style={"textAlign": "center", "marginTop": "20px"})
        
        # Get topic label
        topic_label = df[df["topic"] == clicked_topic]['topic_label'].iloc[0] if 'topic_label' in df.columns else f"Cluster {clicked_topic}"
        
        # Create an enhanced styled list of paper titles - UPDATED to make clickable
        paper_list = []
        for i, (_, paper) in enumerate(papers_in_cluster.iterrows()):
            paper_url = paper["url"]
            paper_title = paper["title"]
            
            paper_list.append(
                dbc.Card(
                    dbc.CardBody([
                        html.A(
                            html.H6(
                                f"{i+1}. {paper_title}", 
                                className="card-title", 
                                style={
                                    "fontSize": "14px", 
                                    "margin": "5px 0",
                                    "fontWeight": "normal",
                                    "lineHeight": "1.4",
                                    "color": "#aaccff",  # Blue color to indicate clickable link
                                    "cursor": "pointer"
                                }
                            ),
                            href=paper_url,
                            target="_blank",  # Open in new tab
                            style={"textDecoration": "none"}
                        ),
                    ], style={"padding": "12px"}),
                    style={
                        "marginBottom": "10px", 
                        "backgroundColor": "rgba(40, 45, 60, 0.8)", 
                        "borderRadius": "8px",
                        "borderLeft": f"4px solid {topic_color}",
                        "boxShadow": "0px 3px 8px rgba(0, 0, 0, 0.2)",
                        "transition": "transform 0.2s",
                        ":hover": {
                            "transform": "translateY(-2px)",
                            "boxShadow": "0px 5px 10px rgba(0, 0, 0, 0.3)"
                        }
                    },
                    className="paper-card"
                )
            )
        
        return html.Div([
            html.Div([
                html.H4(
                    f"Cluster {clicked_topic}", 
                    style={
                        "textAlign": "center", 
                        "marginBottom": "5px",
                        "color": topic_color,
                        "fontWeight": "bold"
                    }
                ),
                html.H5(
                    topic_label, 
                    style={
                        "textAlign": "center", 
                        "marginBottom": "5px",
                        "color": "#aaaacc",
                        "fontStyle": "italic",
                        "fontWeight": "normal"
                    }
                ),
                html.Div(
                    topic_theme,
                    style={
                        "textAlign": "center", 
                        "marginBottom": "15px",
                        "fontSize": "16px",
                        "fontWeight": "bold"
                    }
                ),
                html.Hr(style={"borderColor": "rgba(100, 100, 200, 0.3)", "margin": "10px 0 20px 0"}),
                html.H5(
                    f"Papers ({len(papers_in_cluster)})", 
                    style={
                        "textAlign": "left", 
                        "marginBottom": "15px",
                        "color": "#ffffff",
                        "fontWeight": "bold"
                    }
                ),
            ]),
            html.Div(
                paper_list, 
                style={"paddingRight": "10px"},
            )
        ])
    # Add custom CSS for hover effects
    app.index_string = '''
<!DOCTYPE html>
<html>
    <head>
        {%metas%}
        <title>Trend Analysis Clusters Dashboard</title>
        {%favicon%}
        {%css%}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
        <style>
            .paper-card:hover {
                transform: translateY(-2px);
                box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.3);
                background-color: rgba(50, 55, 70, 0.8) !important;
            }
            a h6:hover {
                color: #ffffff !important;
                text-decoration: underline;
            }
            /* Add subtle scroll bar styling */
            ::-webkit-scrollbar {
                width: 8px;
            }
            ::-webkit-scrollbar-track {
                background: rgba(30, 30, 50, 0.3);
                border-radius: 10px;
            }
            ::-webkit-scrollbar-thumb {
                background: rgba(100, 100, 200, 0.5);
                border-radius: 10px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: rgba(120, 120, 220, 0.7);
            }
        </style>
    </head>
    <body>
        {%app_entry%}
        <footer>
            {%config%}
            {%scripts%}
            {%renderer%}
        </footer>
    </body>
</html>
'''
    return app

# Global variables to track Dash app state
dash_thread = None
dash_app = None
DASH_PORT = 7050

# Simplified shutdown function that doesn't rely on request or psutil connections
def shutdown_dash_app():
    global dash_thread, dash_app
    
    if dash_app is not None:
        try:
            print("Shutting down previous Dash app...")
            
            # If we have a Dash app with a server
            if hasattr(dash_app, 'server'):
                # Set a shutdown flag
                dash_app._shutdown = True
                
            # Force the thread to terminate
            if dash_thread and dash_thread.is_alive():
                import ctypes
                ctypes.pythonapi.PyThreadState_SetAsyncExc(
                    ctypes.c_long(dash_thread.ident),
                    ctypes.py_object(SystemExit)
                )
                dash_thread.join(timeout=2)
                
            # Try to find and kill the process using the port
            try:
                import psutil
                import os
                import signal
                
                for proc in psutil.process_iter(['pid']):
                    try:
                        for conn in proc.connections(kind='inet'):
                            if conn.laddr.port == DASH_PORT:
                                print(f"Killing process {proc.pid} using port {DASH_PORT}")
                                os.kill(proc.pid, signal.SIGTERM)
                    except:
                        pass
            except:
                print("Could not find process using port")
                
            # Clear references
            dash_app = None
            print("Previous Dash app successfully shut down")
            return True
            
        except Exception as e:
            print(f"Error shutting down Dash app: {e}")
            # Even if there were errors, reset the state
            dash_app = None
            return True
            
    return True  # No app to shut down

# Updated function to run Dash with error handling
def run_dash(df,titleNm,Topic_year):
    global dash_app
    
    try:
        # Build the dashboard
        dash_app = build_dashboard(df,titleNm,Topic_year)
        
        # Run the server
        dash_app.run_server(debug=False, port=DASH_PORT, use_reloader=False)
    except Exception as e:
        print(f"Error running Dash app: {e}")
        dash_app = None

# Update your endpoint - removed request parameter from shutdown_dash_app
@router.post("/analyze-trends/")
async def analyze_trends(request: Request, data_request: TrendAnalysisRequest):
    global dash_thread
    TitleName=data_request.topic
    Topic_year=data_request.year
    # First, ensure any existing dashboard is properly shut down
    shutdown_dash_app()
    
    # Short delay to ensure port is freed
    import time
    time.sleep(1)
    
    # Fetch and process data
    df, current_page, total_pages, papers_count, total_papers = await fetch_papers_with_pagination(
        request, data_request.userId, data_request.topic, data_request.year, data_request.page
    )
    
    if df.empty and total_papers > 0:
        raise HTTPException(
            status_code=404, 
            detail=f"No papers found for page {data_request.page+1}. Valid pages are 1 to {total_pages}."
        )
    elif df.empty:
        raise HTTPException(
            status_code=404, 
            detail=f"No papers found for userId '{data_request.userId}', topic '{data_request.topic}'" + 
                  (f", and year '{data_request.year}'" if data_request.year else "")
        )
    
    # Perform the trend analysis
    df, topic_labels = perform_trend_analysis(df)
    
    if df.empty:
        raise HTTPException(status_code=500, detail="Failed to process embeddings for trend analysis")
    
    # Create cluster statistics
    cluster_sizes = df.groupby("topic").size().to_dict()
    
    # Create and start a new thread for the dashboard
    dash_thread = threading.Thread(target=run_dash, args=(df,TitleName,Topic_year))
    dash_thread.daemon = True
    dash_thread.start()
    
    # Open browser automatically
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()
    
    return {
        "message": f"Trend analysis completed for papers (page {current_page + 1} of {total_pages})",
        "current_page": current_page,
        "total_pages": total_pages,
        "papers_count": papers_count,
        "total_papers": total_papers,
        "cluster_sizes": cluster_sizes,
        "cluster_titles": topic_labels,
        "dashboard_url": f"http://localhost:{DASH_PORT}"
    }


# Function to open browser after a short delay
def open_browser():
    time.sleep(2)  # Wait for servers to start
    webbrowser.open_new(f"http://localhost:{DASH_PORT}")


   
