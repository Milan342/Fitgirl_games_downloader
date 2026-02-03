import re
import uuid
import requests
import time
from flask import Flask, render_template, request, Response, jsonify
from threading import Thread
import json

app = Flask(__name__)

# Store processing jobs and their results
jobs = {}

# Headers for requests (from htmlScrapper.py)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Delay between fetching pages (seconds)
FETCH_DELAY = 0.5


def extract_download_link(html_text):
    """Extract download URL from HTML using window.open pattern (from browserOpen.py)"""
    match = re.search(r'window\.open\(["\']([^"\']+)["\']', html_text)
    return match.group(1) if match else None


def process_links(job_id, links):
    """Process links sequentially and update job status"""
    jobs[job_id] = {
        "status": "processing",
        "total": len(links),
        "processed": 0,
        "results": [],
        "errors": [],
        "current": "",
        "messages": []
    }
    
    for i, link in enumerate(links):
        link = link.strip()
        if not link:
            continue
            
        jobs[job_id]["current"] = link
        jobs[job_id]["messages"].append(f"[{i+1}/{len(links)}] Fetching: {link}")
        
        try:
            response = requests.get(link, headers=HEADERS, timeout=30)
            response.raise_for_status()
            
            download_url = extract_download_link(response.text)
            
            if download_url:
                jobs[job_id]["results"].append({
                    "original": link,
                    "download_url": download_url,
                    "status": "success"
                })
                jobs[job_id]["messages"].append(f"✓ Extracted: {download_url[:60]}...")
            else:
                jobs[job_id]["errors"].append({
                    "original": link,
                    "error": "No download link found in page"
                })
                jobs[job_id]["messages"].append(f"✗ No download link found")
                
        except requests.RequestException as e:
            jobs[job_id]["errors"].append({
                "original": link,
                "error": str(e)
            })
            jobs[job_id]["messages"].append(f"✗ Error: {str(e)[:50]}")
        
        jobs[job_id]["processed"] = i + 1
        time.sleep(FETCH_DELAY)
    
    jobs[job_id]["status"] = "completed"
    jobs[job_id]["current"] = ""
    jobs[job_id]["messages"].append(f"Done! Extracted {len(jobs[job_id]['results'])} links, {len(jobs[job_id]['errors'])} errors")


@app.route("/")
def index():
    """Render main page"""
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    """Start processing links"""
    links = []
    
    # Get links from textarea
    if request.form.get("links"):
        links = request.form["links"].strip().split("\n")
    
    # Or from uploaded file
    elif request.files.get("file"):
        file = request.files["file"]
        content = file.read().decode("utf-8", errors="ignore")
        links = content.strip().split("\n")
    
    # Filter empty lines
    links = [l.strip() for l in links if l.strip()]
    
    if not links:
        return jsonify({"error": "No links provided"}), 400
    
    # Create job
    job_id = str(uuid.uuid4())
    
    # Start processing in background thread
    thread = Thread(target=process_links, args=(job_id, links))
    thread.daemon = True
    thread.start()
    
    return jsonify({"job_id": job_id, "total": len(links)})


@app.route("/status/<job_id>")
def status(job_id):
    """Server-Sent Events endpoint for progress updates"""
    def generate():
        last_message_count = 0
        while True:
            if job_id not in jobs:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                break
            
            job = jobs[job_id]
            
            # Send new messages
            new_messages = job["messages"][last_message_count:]
            last_message_count = len(job["messages"])
            
            data = {
                "status": job["status"],
                "processed": job["processed"],
                "total": job["total"],
                "current": job["current"],
                "messages": new_messages,
                "results_count": len(job["results"]),
                "errors_count": len(job["errors"])
            }
            
            if job["status"] == "completed":
                data["results"] = job["results"]
                data["errors"] = job["errors"]
                yield f"data: {json.dumps(data)}\n\n"
                break
            
            yield f"data: {json.dumps(data)}\n\n"
            time.sleep(0.5)
    
    return Response(generate(), mimetype="text/event-stream")


if __name__ == "__main__":
    print("Starting FitGirl Downloader Web Interface...")
    print("Open http://localhost:5000 in your browser")
    app.run(debug=False, port=5000, threaded=True)
