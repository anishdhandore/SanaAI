#!/bin/bash
# Simple startup script for the FastAPI backend

echo "Starting SanaAI Job Assistant Backend..."
echo "Make sure you have set OPENAI_API_KEY environment variable"
echo ""

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

# Start the server
echo "Starting server on http://localhost:8000"
python main.py
