# Deployed Website
https://cf.klivanskyr.workers.dev/

# Brown University Course Search AI Agent

An intelligent course search and degree planning assistant powered by Cloudflare Workers AI, designed to help Brown University students discover courses and plan their academic journey.

## 🎯 What This Project Does

This application provides an AI-powered chat interface that helps Brown University students:

- **Search Courses**: Find courses by name, department, description, or any keyword using semantic search
- **Degree Planning**: Get personalized course recommendations based on major and completed coursework
- **Academic Guidance**: Receive intelligent suggestions for course sequences and requirements

The system uses advanced vector search and large language models to understand natural language queries and provide relevant, contextual responses about Brown's course catalog.

## 🏗️ How It Works

### Architecture Overview

The application follows a modern serverless architecture built on Cloudflare's edge computing platform:

1. **Data Ingestion**: Python scrapers collect course data from Brown's official bulletin
2. **Vector Database**: Course information is embedded using AI models and stored in Cloudflare Vectorize
3. **AI Agent**: A conversational AI agent processes user queries and searches the knowledge base
4. **Edge Deployment**: The entire application runs on Cloudflare Workers for global, low-latency access

### Data Flow

```
Brown Bulletin → Python Scrapers → JSON Data → Vector Embeddings → Cloudflare Vectorize
                                                                            ↓
User Query → React Frontend → AI Agent → Semantic Search → Formatted Response
```

## 🛠️ Technologies Used

### Frontend & UI
- **React 19** - Modern React with latest features and concurrent rendering
- **TypeScript** - Type-safe development with enhanced developer experience  
- **Tailwind CSS** - Utility-first styling framework
- **Vite** - Fast development server and build tool
- **Radix UI** - Accessible component primitives for consistent UX

### Backend & AI
- **Cloudflare Workers** - Serverless runtime for edge computing
- **Cloudflare Workers AI** - Built-in AI capabilities with Llama 3.3 70B model
- **Cloudflare Vectorize** - Vector database for semantic search
- **OpenAI GPT-4** - Advanced language model for conversational AI
- **AI SDK** - Unified interface for AI model interactions

### Data Processing
- **Python** - Web scraping and data processing scripts
- **Beautiful Soup** - HTML parsing for bulletin scraping
- **Requests** - HTTP client for data fetching

### Development Tools
- **Wrangler** - Cloudflare Workers CLI and deployment tool
- **Biome** - Fast linting and formatting
- **Vitest** - Unit testing framework
- **Prettier** - Code formatting

## 🚀 Build Process & Deployment

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ (for data scrapers)
- Cloudflare account with Workers AI enabled
- OpenAI API key (optional, for enhanced AI features)

### Local Development

1. **Install dependencies**:
   ```bash
   cd cf
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   # Copy example environment file
   cp wrangler.toml.example wrangler.toml
   # Add your API keys and configuration
   ```

3. **Start development server**:
   ```bash
   npm run start
   ```

### Data Pipeline

1. **Scrape course data**:
   ```bash
   cd scrapers
   pip install -r requirements.txt
   python cab_scraper.py      # Scrape course catalog
   python bulletin_scraper.py # Scrape degree requirements
   python cab_cleaner.py      # Normalize and clean data
   ```

2. **Index data into Vectorize**:
   ```bash
   cd cf
   npx wrangler vectorize create brown-courses --dimensions=768
   npx wrangler vectorize create brown-requirements --dimensions=768
   npm run deploy:indexer
   ```

### Production Deployment

1. **Build and deploy**:
   ```bash
   npm run deploy
   ```

2. **Verify deployment**:
   ```bash
   wrangler tail  # Monitor logs
   ```


## 🎨 Features

- **Semantic Search**: Natural language course discovery using vector embeddings
- **Real-time Chat**: Streaming AI responses with tool invocations
- **Degree Planning**: Intelligent recommendations based on major requirements
- **Course Details**: Comprehensive information including schedules, prerequisites, and availability

