import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dash import Dash, dcc, html, Input, Output, State
import numpy as np
import random
import math
from collections import defaultdict
import colorsys
from fastapi import HTTPException
from pydantic import BaseModel
import threading
import webbrowser
import os
import psutil
import socket
from fastapi import HTTPException, APIRouter, Request
router = APIRouter()

# Global variables to track dashboard state
dashboard_port = 8050
dashboard_process = None

# MongoDB connection and data loader function
async def load_data_from_mongodb(userId, topic, year, request:Request):
    query = {
        "userId": userId,
        "topic": topic,
        "year": year
    }
    collection = request.app.state.collection2
    document = await collection.find_one(query)
    if not document:
        raise ValueError(f"No data found for userId={userId}, topic={topic}, year={year}")
    # Extract metadata and convert to DataFrame
    metadata = document.get("metadata", [])
    df = pd.DataFrame(metadata)
    df['publication_date'] = pd.to_datetime(df['publication_date'])
    return df

# Common functions (unchanged)
def filter_by_date_range(dataframe, start_idx, end_idx):
    start_date = date_range[start_idx]
    end_date = date_range[end_idx]
    return dataframe[(dataframe['publication_date'] >= start_date) & 
                    (dataframe['publication_date'] <= end_date)]

def generate_vibrant_colors(n):
    base_colors = []
    for i in range(n):
        hue = (i / n) % 1.0
        saturation = random.uniform(0.7, 0.9)
        value = random.uniform(0.7, 0.9)
        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        vibrant_color = '#{:02x}{:02x}{:02x}'.format(
            int(r * 255), 
            int(g * 255), 
            int(b * 255)
        )
        end_color_r = min(255, int(r * 255 * 1.1))
        end_color_g = min(255, int(g * 255 * 1.1))
        end_color_b = min(255, int(b * 255 * 1.1))
        gradient_end = '#{:02x}{:02x}{:02x}'.format(end_color_r, end_color_g, end_color_b)
        base_colors.append({
            'start': vibrant_color,
            'end': gradient_end
        })
    extended_colors = base_colors * math.ceil(n/10)
    final_colors = []
    for i in range(n):
        color = extended_colors[i]
        jitter = random.uniform(0.9, 1.1)
        def jitter_color(hex_color):
            r, g, b = [min(255, max(0, int(int(hex_color[j:j+2], 16) * jitter))) for j in (1, 3, 5)]
            return f'rgba({r}, {g}, {b}, 0.9)'
        final_colors.append({
            'start': jitter_color(color['start']),
            'end': jitter_color(color['end']).replace('0.9', '0.8')
        })
    return final_colors

# Knowledge map creator function (unchanged)
def create_knowledge_map(filtered_df, view_type='host'):
    color_palette = {
    'background': '#1E1E1E',        # Dark background (almost black)
    'card_bg': '#1A2238',           # Bluish-black for cards (from your image)
    'accent1': '#FF6A3D',           # Orange for headings (keeping from original)
    'accent2': '#4ECCA3',           # Keeping teal for secondary elements
    'accent3': '#9D84B7',           # Keeping lavender for tertiary elements
    'text_light': '#FFFFFF',        # White text
    'text_dark': '#E0E0E0',         # Light grey text for dark backgrounds
}

    if view_type == 'host':
        group_col = 'host_organization_name'
        id_col = 'host_organization_id'
        title = "Host Organization Clusters"
    else:
        group_col = 'venue'
        id_col = 'venue_id'
        title = "Publication Venue Clusters"
    summary = filtered_df.groupby(group_col).agg(
        paper_count=('id', 'count'),
        is_oa=('is_oa', 'mean'),
        oa_status=('oa_status', lambda x: x.mode()[0] if not x.mode().empty else None),
        entity_id=(id_col, 'first')
    ).reset_index()
    paper_count_groups = defaultdict(list)
    for _, row in summary.iterrows():
        paper_count_groups[row['paper_count']].append(row)
    knowledge_map_fig = go.Figure()
    sorted_counts = sorted(paper_count_groups.keys(), reverse=True)
    vibrant_colors = generate_vibrant_colors(len(sorted_counts))
    golden_angle = np.pi * (3 - np.sqrt(5))
    spiral_coef = 150
    cluster_metadata = {}
    max_x, max_y = 500, 500
    for i, count in enumerate(sorted_counts):
        radius = np.sqrt(i) * spiral_coef
        theta = golden_angle * i
        cluster_x, cluster_y = radius * np.cos(theta), radius * np.sin(theta)
        label_offset_angle = theta + np.pi/4
        label_offset_distance = 80 + 4 * np.sqrt(len(paper_count_groups[count]))
        label_x = cluster_x + label_offset_distance * np.cos(label_offset_angle)
        label_y = cluster_y + label_offset_distance * np.sin(label_offset_angle)
        cluster_metadata[count] = {
            'center_x': cluster_x,
            'center_y': cluster_y,
            'entities': paper_count_groups[count],
            'color': vibrant_colors[i]
        }
        entities = paper_count_groups[count]
        num_entities = len(entities)
        cluster_size = min(200, max(80, 40 + 8 * np.sqrt(num_entities)))
        color = vibrant_colors[i]
        knowledge_map_fig.add_shape(
            type="circle",
            x0=cluster_x - cluster_size/2, y0=cluster_y - cluster_size/2,
            x1=cluster_x + cluster_size/2, y1=cluster_y + cluster_size/2,
            fillcolor=color['end'].replace("0.8", "0.15"),
            line=dict(color=color['start'], width=1.5),
            opacity=0.7
        )
        knowledge_map_fig.add_trace(go.Scatter(
            x=[cluster_x], y=[cluster_y],
            mode='markers',
            marker=dict(size=cluster_size, color=color['start'], opacity=0.3),
            customdata=[[count, "cluster"]],
            hoverinfo='skip'
        ))
        knowledge_map_fig.add_trace(go.Scatter(
            x=[cluster_x, label_x], y=[cluster_y, label_y],
            mode='lines',
            line=dict(color=color['start'], width=1, dash='dot'),
            hoverinfo='skip'
        ))
        knowledge_map_fig.add_annotation(
            x=label_x, y=label_y,
            text=f"{count} papers<br>{num_entities} {'orgs' if view_type == 'host' else 'venues'}",
            showarrow=False,
            font=dict(size=11, color='white'),
            bgcolor=color['start'],
            bordercolor='white',
            borderwidth=1,
            opacity=0.9
        )
        entities_sorted = sorted(entities, key=lambda x: x[group_col])
        inner_spiral_coef = 0.4
        for j, entity_data in enumerate(entities_sorted):
            spiral_radius = np.sqrt(j) * cluster_size * inner_spiral_coef / np.sqrt(num_entities + 1)
            spiral_angle = golden_angle * j
            jitter_radius = random.uniform(0.9, 1.1) * spiral_radius
            jitter_angle = spiral_angle + random.uniform(-0.1, 0.1)
            entity_x = cluster_x + jitter_radius * np.cos(jitter_angle)
            entity_y = cluster_y + jitter_radius * np.sin(jitter_angle)
            node_size = min(18, max(8, np.sqrt(entity_data['paper_count']) * 1.5))
            knowledge_map_fig.add_trace(go.Scatter(
                x=[entity_x], y=[entity_y],
                mode='markers',
                marker=dict(
                    size=node_size,
                    color=color['start'],
                    line=dict(color='rgba(255, 255, 255, 0.9)', width=1.5)
                ),
                customdata=[[
                    entity_data[group_col],
                    entity_data['paper_count'],
                    entity_data['is_oa'],
                    entity_data['entity_id'],
                    count,
                    "entity"
                ]],
                hovertemplate=(
                    f"<b>{entity_data[group_col]}</b><br>"
                    f"Papers: {entity_data['paper_count']}<br>"
                    f"Open Access: {entity_data['is_oa']:.1%}<extra></extra>"
                )
            ))
    max_x = max([abs(cluster['center_x']) for cluster in cluster_metadata.values()]) + 150 if cluster_metadata else 500
    max_y = max([abs(cluster['center_y']) for cluster in cluster_metadata.values()]) + 150 if cluster_metadata else 500
   # Update knowledge_map_fig layout
    knowledge_map_fig.update_layout(
    title=dict(
        text=title, 
        font=dict(size=22, family='"Poppins", sans-serif', color=color_palette['accent1'])  # Orange title
    ),
    plot_bgcolor='rgba(26, 34, 56, 1)',  # Bluish-black background
    paper_bgcolor='rgba(26, 34, 56, 0.7)',
    xaxis=dict(range=[-max(700, max_x), max(700, max_x)], showticklabels=False, showgrid=False),
    yaxis=dict(range=[-max(500, max_y), max(500, max_y)], showticklabels=False, showgrid=False),
    margin=dict(l=10, r=10, t=60, b=10),
    height=700,
    hovermode='closest',
    showlegend=False,
    font=dict(family='"Poppins", sans-serif', color=color_palette['text_light']),  # Light text
)
    return knowledge_map_fig, cluster_metadata

# Other chart functions (unchanged)
def create_oa_pie_fig(filtered_df):
    color_palette = {
        'background': '#1A2238',  # Dark blue background
        'card_bg': '#1A2238',     # Changed to match the other chart
        'accent1': '#FF6A3D',     # Vibrant orange for highlights
        'accent2': '#4ECCA3',     # Teal for secondary elements
        'accent3': '#9D84B7',     # Lavender for tertiary elements
        'text_light': '#FFFFFF',  # White text
        'text_dark': '#FFFFFF',   # Changed to white for better contrast
    }
    
    fig = px.pie(
        filtered_df, names='is_oa', title="Overall Open Access Status",
        labels={True: "Open Access", False: "Not Open Access"},
        color_discrete_sequence=[color_palette['accent2'], color_palette['accent1']]
    )
    
    fig.update_traces(
        textinfo='label+percent', 
        textfont=dict(size=14, family='"Poppins", sans-serif'),
        marker=dict(line=dict(color='#1A2238', width=2))  # Match background color
    )
    
    fig.update_layout(
        title=dict(
            text="Overall Open Access Status", 
            font=dict(size=18, family='"Poppins", sans-serif', color=color_palette['accent1'])  # Orange title
        ),
        font=dict(family='"Poppins", sans-serif', color=color_palette['text_light']),
        paper_bgcolor=color_palette['background'],  # Dark background
        plot_bgcolor=color_palette['background'],   # Dark background
        margin=dict(t=50, b=20, l=20, r=20),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=-0.2,
            xanchor="center",
            x=0.5,
            font=dict(size=12, color=color_palette['text_light'])
        )
    )
    
    return fig
def create_oa_status_pie_fig(filtered_df):
    custom_colors = [
       "#9D84B7", 
        '#4DADFF', 
        '#FFD166', 
        '#06D6A0', 
        '#EF476F'
    ]
    fig = px.pie(
        filtered_df, 
        names='oa_status', 
        title="Open Access Status Distribution",
        color_discrete_sequence=custom_colors
    )
    fig.update_traces(
        textinfo='label+percent', 
        insidetextorientation='radial',
        textfont=dict(size=14, family='"Poppins", sans-serif'),
        marker=dict(line=dict(color='#FFFFFF', width=2))
    )
    fig.update_layout(
        title=dict(
            text="Open Access Status Distribution", 
            font=dict(size=18, family='"Poppins", sans-serif', color="#FF6A3D")
        ),
        font=dict(family='"Poppins", sans-serif', color='#FFFFFF'),
        paper_bgcolor='#1A2238',  # Bluish-black background
        plot_bgcolor='#1A2238',
        margin=dict(t=50, b=20, l=20, r=20),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=-0.2,
            xanchor="center",
            x=0.5,
            font=dict(size=12, color='#FFFFFF')
        )
    )
    return fig
def create_type_bar_fig(filtered_df):
    type_counts = filtered_df['type'].value_counts()
    vibrant_colors = [
        '#4361EE', '#3A0CA3', '#4CC9F0', 
        '#F72585', '#7209B7', '#B5179E', 
        '#480CA8', '#560BAD', '#F77F00'
    ]
    fig = px.bar(
        type_counts, 
        title="Publication Types",
        labels={'value': 'Count', 'index': 'Type'},
        color=type_counts.index,
        color_discrete_sequence=vibrant_colors[:len(type_counts)]
    )
    fig.update_layout(
        title=dict(
            text="Publication Types", 
            font=dict(size=20, family='"Poppins", sans-serif', color="#FF6A3D")  # Larger font size
        ),
        xaxis_title="Type", 
        yaxis_title="Count",
        font=dict(family='"Poppins", sans-serif', color="#FFFFFF", size=14),  # Increased font size
        paper_bgcolor='#1A2238',  # Consistent dark background
        plot_bgcolor='#1A2238',  # Consistent dark background
        margin=dict(t=70, b=60, l=60, r=40),  # Increased margins
        xaxis=dict(
            tickfont=dict(size=14, color="#FFFFFF"),  # Increased tick font size
            tickangle=-45,
            gridcolor='rgba(255, 255, 255, 0.1)'  # Lighter grid lines
        ),
        yaxis=dict(
            tickfont=dict(size=14, color="#FFFFFF"),  # Increased tick font size
            gridcolor='rgba(255, 255, 255, 0.1)'  # Lighter grid lines
        ),
        bargap=0.3,  # Increased bar gap
    )
    fig.update_traces(
        marker_line_width=1,
        marker_line_color='rgba(0, 0, 0, 0.5)',
        opacity=0.9,
        hovertemplate='%{y} publications<extra></extra>',
        texttemplate='%{y}',  # Add text labels
        textposition='outside',  # Position labels outside bars
        textfont=dict(size=14, color='white')  # Text label formatting
    )
    return fig

# Function to check if port is in use
def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

# Function to find a free port
def find_free_port(start_port=8050):
    port = start_port
    while is_port_in_use(port):
        port += 1
    return port

# Function to shutdown any existing dashboard
def shutdown_existing_dashboard():
    global dashboard_process
    
    # First, check if our port is in use
    if is_port_in_use(dashboard_port):
        try:
            # Kill processes using the port
            for proc in psutil.process_iter(['pid', 'name', 'connections']):
                try:
                    for conn in proc.connections():
                        if conn.laddr.port == dashboard_port:
                            print(f"Terminating process {proc.pid} using port {dashboard_port}")
                            proc.terminate()
                            proc.wait(timeout=3)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except Exception as e:
            print(f"Error freeing port {dashboard_port}: {e}")
    
    # If we're tracking a dashboard process, try to terminate it
    if dashboard_process is not None:
        try:
            # Kill the process if it's still running
            if dashboard_process.is_alive():
                parent = psutil.Process(os.getpid())
                children = parent.children(recursive=True)
                for process in children:
                    try:
                        process.terminate()
                    except:
                        pass
            dashboard_process = None
        except Exception as e:
            print(f"Error terminating dashboard process: {e}")
            dashboard_process = None  # Reset the reference anyway

# Pydantic model for request validation
class DashboardRequest(BaseModel):
    userId: str
    topic: str
    year: int

@router.post("/load_and_display_dashboard/")
async def load_and_display_dashboard(request: DashboardRequest, req:Request):
    global dashboard_process, dashboard_port
    
    # Make sure any existing dashboard is shut down
    shutdown_existing_dashboard()
    
    # Find a free port
    dashboard_port = find_free_port()
    
    try:
        # Load data from MongoDB
        df = await load_data_from_mongodb(request.userId, request.topic, request.year, req)
        
        # Get date range for the slider
        global min_date, max_date, date_range, date_marks
        min_date = df['publication_date'].min()
        max_date = df['publication_date'].max()
        date_range = pd.date_range(start=min_date, end=max_date, freq='MS')
        date_marks = {i: date.strftime('%b %Y') for i, date in enumerate(date_range)}
        
        # Function to create and run the dashboard
        def create_and_run_dashboard():
            # Create a new app instance
            app = Dash(__name__, suppress_callback_exceptions=True)
            app.cluster_metadata = {}
            color_palette = {
                    'background': '#1A2238',  # Dark blue background
                    'card_bg': '#F8F8FF',      # Off-white for cards
                    'accent1': '#FF6A3D',      # Vibrant orange for highlights
                    'accent2': '#4ECCA3',      # Teal for secondary elements
                    'accent3': '#9D84B7',      # Lavender for tertiary elements
                    'text_light': '#FFFFFF',   # White text
                    'text_dark': '#2D3748',    # Dark gray text
                }

                # Define modern styling for containers
            container_style = {
                    'padding': '5px', 
                    'backgroundColor': color_palette['text_dark'], 
                    'borderRadius': '12px', 
                    'boxShadow': '0 4px 12px rgba(0, 0, 0, 0.15)', 
                    'marginBottom': '25px',
                    'border': f'1px solid rgba(255, 255, 255, 0.2)',
                    
                }

            hidden_style = {**container_style, 'display': 'none'}
            visible_style = {**container_style}

            # Create a modern, attractive layout
            app.layout = html.Div([
                    # Header section with gradient background
                    html.Div([
                        html.H1(request.topic.capitalize() + " Analytics Dashboard", style={
                            'textAlign': 'center', 
                            'marginBottom': '10px',
                            'color': color_palette['accent1'],
                            'fontSize': '2.5rem',
                            'fontWeight': '700',
                            'letterSpacing': '0.5px',
                        }),
                        html.Div([
                            html.P("Research Publication Analysis & Knowledge Mapping", style={
                                'textAlign': 'center',
                                'color': color_palette['text_light'],
                                'opacity': '0.8',
                                'fontSize': '1.2rem',
                                'marginTop': '0',
                            })
                        ])
                    ], style={
                        'background': f'linear-gradient(135deg, {color_palette["background"]}, #364156)',
                        'padding': '30px 20px',
                        'borderRadius': '12px',
                        'marginBottom': '25px',
                        'boxShadow': '0 4px 20px rgba(0, 0, 0, 0.2)',
                    }),
                    
                    # Controls section
                    html.Div([
                        html.Div([
                            html.Button(
                                id='view-toggle',
                                children='Switch to Venue View',
                                style={
                                    'padding': '12px 20px',
                                    'fontSize': '1rem',
                                    'borderRadius': '8px',
                                    'border': 'none',
                                    'backgroundColor': color_palette['accent1'],
                                    'color': 'white',
                                    'cursor': 'pointer',
                                    'boxShadow': '0 2px 5px rgba(0, 0, 0, 0.1)',
                                    'transition': 'all 0.3s ease',
                                    'marginRight': '20px',
                                    'fontWeight': '500',
                                }
                            ),
                            html.H3("Filter by Publication Date", style={
                                'marginBottom': '15px',
                                'color': color_palette['text_dark'],
                                'fontSize': '1.3rem',
                                'fontWeight': '600',
                            }),
                        ], style={'display': 'flex', 'alignItems': 'center', 'marginBottom': '15px'}),
                        
                        dcc.RangeSlider(
                            id='date-slider',
                            min=0,
                            max=len(date_range) - 1,
                            value=[0, len(date_range) - 1],
                            marks=date_marks if len(date_marks) <= 12 else {
                                i: date_marks[i] for i in range(0, len(date_range), max(1, len(date_range) // 12))
                            },
                            step=1,
                            tooltip={"placement": "bottom", "always_visible": True},
                            updatemode='mouseup'
                        ),
                        html.Div(id='date-range-display', style={
                            'textAlign': 'center', 
                            'marginTop': '12px', 
                            'fontSize': '1.1rem',
                            'fontWeight': '500',
                            'color': color_palette['accent1'],
                        })
                    ], style={**container_style, 'marginBottom': '25px'}),
                    
                    # Knowledge map - main visualization
                    html.Div([
                        dcc.Graph(
                            id='knowledge-map',
                            style={'width': '100%', 'height': '700px'},
                            config={'scrollZoom': True, 'displayModeBar': True, 'responsive': True}
                        )
                    ], style={
                        **container_style, 
                        'height': '750px', 
                        'marginBottom': '25px',
                        'background': f'linear-gradient(to bottom right, {color_palette["card_bg"]}, #F0F0F8)',
                    }),
                    
                    # Details container - appears when clicking elements
                    html.Div([
                        html.H3(id='details-title', style={
                            'marginBottom': '15px',
                            'color': color_palette['accent1'],
                            'fontSize': '1.4rem',
                            'fontWeight': '600',
                        }),
                        html.Div(id='details-content', style={
                            'maxHeight': '350px', 
                            'overflowY': 'auto',
                            'padding': '10px',
                            'borderRadius': '8px',
                            'backgroundColor': 'rgba(255, 255, 255, 0.7)',
                        })
                    ], id='details-container', style=hidden_style),
                    
                    # Charts in flex container
                    html.Div([
                        html.Div([
                            dcc.Graph(
                                id='oa-pie-chart', 
                                style={'width': '100%', 'height': '350px'},
                                config={'displayModeBar': False, 'responsive': True}
                            )
                        ], style={
                            'flex': 1, 
                            **container_style, 
                            'margin': '0 10px', 
                            'height': '400px',
                            'transition': 'transform 0.3s ease',
                            ':hover': {'transform': 'translateY(-5px)'},
                        }),
                        html.Div([
                            dcc.Graph(
                                id='oa-status-pie-chart', 
                                style={'width': '100%', 'height': '350px'},
                                config={'displayModeBar': False, 'responsive': True}
                            )
                        ], style={
                            'flex': 1, 
                            **container_style, 
                            'margin': '0 10px', 
                            'height': '400px',
                            'transition': 'transform 0.3s ease',
                            ':hover': {'transform': 'translateY(-5px)'},
                        })
                    ], style={'display': 'flex', 'marginBottom': '25px', 'height': '420px'}),
                    
                    # Bar chart container
                  # Increase bar chart height and improve visibility
                    html.Div([
                            dcc.Graph(
                                id='type-bar-chart', 
                                style={'width': '100%', 'height': '50vh'},  # Reduced from 60vh
                                config={'displayModeBar': False, 'responsive': True}
                            )
                        ], style={
                            **container_style,
                            'height': '500px',  # Decreased from 650px
                            'background': 'rgba(26, 34, 56, 1)',
                            'marginBottom': '10px',  # Added smaller bottom margin
                        }), 
                    # Store components for state
                    dcc.Store(id='filtered-df-info'),
                    dcc.Store(id='current-view', data='host'),
                    html.Div(id='load-trigger', children='trigger-initial-load', style={'display': 'none'})
                ], style={
                    'fontFamily': '"Poppins", "Segoe UI", Arial, sans-serif',
                    'backgroundColor': '#121212',  # Dark background
                    'backgroundImage': 'none',     # Remove gradient
                    'padding': '30px',
                    'maxWidth': '1800px',
                    'margin': '0 auto',
                    'minHeight': '100vh',
                    'color': color_palette['text_light'],
                    'paddingBottom': '10px', 
                })
                            

            
            @app.callback(
                [Output('current-view', 'data'),
                 Output('view-toggle', 'children')],
                [Input('view-toggle', 'n_clicks')],
                [State('current-view', 'data')]
            )
            def toggle_view(n_clicks, current_view):
                if not n_clicks:
                    return current_view, 'Switch to Venue View' if current_view == 'host' else 'Switch to Host View'
                new_view = 'venue' if current_view == 'host' else 'host'
                new_button_text = 'Switch to Host View' if new_view == 'venue' else 'Switch to Venue View'
                return new_view, new_button_text
            
            @app.callback(
                Output('date-range-display', 'children'),
                [Input('date-slider', 'value')]
            )
            def update_date_range_display(date_range_indices):
                start_date = date_range[date_range_indices[0]]
                end_date = date_range[date_range_indices[1]]
                return f"Selected period: {start_date.strftime('%b %Y')} to {end_date.strftime('%b %Y')}"
            
            @app.callback(
                [Output('knowledge-map', 'figure'),
                 Output('oa-pie-chart', 'figure'),
                 Output('oa-status-pie-chart', 'figure'),
                 Output('type-bar-chart', 'figure'),
                 Output('filtered-df-info', 'data'),
                 Output('details-container', 'style')],
                [Input('date-slider', 'value'),
                 Input('current-view', 'data'),
                 Input('load-trigger', 'children')]  # Added trigger
            )
            def update_visualizations(date_range_indices, current_view, _):
                filtered_df = filter_by_date_range(df, date_range_indices[0], date_range_indices[1])
                knowledge_map_fig, cluster_metadata = create_knowledge_map(filtered_df, current_view)
                app.cluster_metadata = cluster_metadata
                filtered_info = {
                    'start_idx': date_range_indices[0],
                    'end_idx': date_range_indices[1],
                    'start_date': date_range[date_range_indices[0]].strftime('%Y-%m-%d'),
                    'end_date': date_range[date_range_indices[1]].strftime('%Y-%m-%d'),
                    'record_count': len(filtered_df),
                    'view_type': current_view
                }
                return (
                    knowledge_map_fig,
                    create_oa_pie_fig(filtered_df),
                    create_oa_status_pie_fig(filtered_df),
                    create_type_bar_fig(filtered_df),
                    filtered_info,
                    hidden_style
                )
            
            @app.callback(
                [Output('details-container', 'style', allow_duplicate=True),
                 Output('details-title', 'children'),
                 Output('details-content', 'children')],
                [Input('knowledge-map', 'clickData')],
                [State('filtered-df-info', 'data')],
                prevent_initial_call=True
            )
            def display_details(clickData, filtered_info):
                if not clickData or not filtered_info:
                    return hidden_style, "", []
                customdata = clickData['points'][0]['customdata']
                view_type = filtered_info['view_type']
                entity_type = "Organization" if view_type == 'host' else "Venue"
                if len(customdata) >= 2 and customdata[-1] == "cluster":
                    count = customdata[0]
                    if count not in app.cluster_metadata:
                        return hidden_style, "", []
                    entities = app.cluster_metadata[count]['entities']
                    color = app.cluster_metadata[count]['color']['start']
                    table_header = [
                        html.Thead(html.Tr([
                            html.Th(f"{entity_type} Name", style={'padding': '8px'}),
                            html.Th(f"{entity_type} ID", style={'padding': '8px'}),
                            html.Th("Papers", style={'padding': '8px', 'textAlign': 'center'}),
                            html.Th("Open Access %", style={'padding': '8px', 'textAlign': 'center'})
                        ], style={'backgroundColor': color_palette['accent1'], 'color': 'white'}))
                    ]

                    # Update row styles
                    row_style = {'backgroundColor': '#232D42'} if i % 2 == 0 else {'backgroundColor': '#1A2238'}
                    rows = []
                    for i, entity in enumerate(sorted(entities, key=lambda x: x['paper_count'], reverse=True)):
                        row_style = {'backgroundColor': '#f9f9f9'} if i % 2 == 0 else {'backgroundColor': 'white'}
                        entity_name_link = html.A(
                            entity[f"{view_type}_organization_name" if view_type == 'host' else "venue"],
                            href=entity['entity_id'],
                            target="_blank",
                            style={'color': color, 'textDecoration': 'underline'}
                        )
                        entity_id_link = html.A(
                            entity['entity_id'].split('/')[-1],
                            href=entity['entity_id'],
                            target="_blank",
                            style={'color': color, 'textDecoration': 'underline'}
                        )
                        rows.append(html.Tr([
                            html.Td(entity_name_link, style={'padding': '8px'}),
                            html.Td(entity_id_link, style={'padding': '8px'}),
                            html.Td(entity['paper_count'], style={'padding': '8px', 'textAlign': 'center'}),
                            html.Td(f"{entity['is_oa']:.1%}", style={'padding': '8px', 'textAlign': 'center'})
                        ], style=row_style))
                    table = html.Table(table_header + [html.Tbody(rows)], style={
                        'width': '100%',
                        'borderCollapse': 'collapse',
                        'boxShadow': '0 1px 3px rgba(0,0,0,0.1)'
                    })
                    return (
                        visible_style,
                        f"{entity_type}s with {count} papers",
                        [html.P(f"Showing {len(entities)} {entity_type.lower()}s during selected period"), table]
                    )
                elif len(customdata) >= 6 and customdata[-1] == "entity":
                    entity_name = customdata[0]
                    entity_id = customdata[3]
                    cluster_count = customdata[4]
                    color = app.cluster_metadata[cluster_count]['color']['start']
                    if view_type == 'host':
                        entity_papers = df[df['host_organization_name'] == entity_name].copy()
                    else:
                        entity_papers = df[df['venue'] == entity_name].copy()
                    entity_papers = entity_papers[
                        (entity_papers['publication_date'] >= pd.to_datetime(filtered_info['start_date'])) & 
                        (entity_papers['publication_date'] <= pd.to_datetime(filtered_info['end_date']))
                    ]
                    entity_name_link = html.A(
                        entity_name,
                        href=entity_id,
                        target="_blank",
                        style={'color': color, 'textDecoration': 'underline', 'fontSize': '1.2em'}
                    )
                    entity_id_link = html.A(
                        entity_id.split('/')[-1],
                        href=entity_id,
                        target="_blank",
                        style={'color': color, 'textDecoration': 'underline'}
                    )
                    header = [
                        html.Div([
                            html.Span("Name: ", style={'fontWeight': 'bold'}),
                            entity_name_link
                        ], style={'marginBottom': '10px'}),
                        html.Div([
                            html.Span("ID: ", style={'fontWeight': 'bold'}),
                            entity_id_link
                        ], style={'marginBottom': '10px'}),
                        html.Div([
                            html.Span(f"Papers: {len(entity_papers)}", style={'marginRight': '20px'}),
                        ], style={'marginBottom': '20px'})
                    ]
                    table_header = [
                        html.Thead(html.Tr([
                            html.Th("Paper ID", style={'padding': '8px'}),
                            html.Th("Type", style={'padding': '8px'}),
                            html.Th("OA Status", style={'padding': '8px', 'textAlign': 'center'}),
                            html.Th("Publication Date", style={'padding': '8px', 'textAlign': 'center'})
                        ], style={'backgroundColor': color, 'color': 'white'}))
                    ]
                    rows = []
                    for i, (_, paper) in enumerate(entity_papers.sort_values('publication_date', ascending=False).iterrows()):
                        row_style = {'backgroundColor': '#232D42'} if i % 2 == 0 else {'backgroundColor': '#1A2238'}
                        paper_link = html.A(
                            paper['id'],
                            href=paper['id'],
                            target="_blank",
                            style={'color': color, 'textDecoration': 'underline'}
                        )
                        rows.append(html.Tr([
                            html.Td(paper_link, style={'padding': '8px'}),
                            html.Td(paper['type'], style={'padding': '8px'}),
                            html.Td(paper['oa_status'], style={'padding': '8px', 'textAlign': 'center'}),
                            html.Td(paper['publication_date'].strftime('%Y-%m-%d'), style={'padding': '8px', 'textAlign': 'center'})
                        ], style=row_style))
                    table = html.Table(table_header + [html.Tbody(rows)], style={
                        'width': '100%',
                        'borderCollapse': 'collapse',
                        'boxShadow': '0 1px 3px rgba(0,0,0,0.1)'
                    })
                    with open("dashboard.html", "w") as f:
                        f.write(app.index())
                    print("yup saved!!")    
                    return visible_style, f"{entity_type} Papers", header + [table]
                return hidden_style, "", []
            
            # Start the Dash app
            app.run_server(debug=False, port=dashboard_port, use_reloader=False)
        
        # Run the dashboard in a separate process
        dashboard_process = threading.Thread(target=create_and_run_dashboard)
        dashboard_process.daemon = True
        dashboard_process.start()
        
        # Open the browser after a delay
        def open_browser():
            try:
                webbrowser.open_new(f"http://127.0.0.1:{dashboard_port}/")
            except:
                pass
        
        threading.Timer(1.5, open_browser).start()
        
        return {"status": "success", "message": f"Dashboard loaded successfully on port {dashboard_port}."}
    
    except Exception as e:
        # Clean up in case of failure
        shutdown_existing_dashboard()
        raise HTTPException(status_code=400, detail=str(e))