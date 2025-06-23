import http.server
import socketserver
import os
import json

PORT = 8000

# API Keys
API_KEYS = {
    'gemini': 'AIzaSyB-rps5DDZR0gupBxlaSqylke-M4n2GYyQ',
    'news': '08d5366f2a099170c4d1383ceea8b21c',
    'mapbox': 'pk.eyJ1IjoicnVzdGFtbGl0dXJhbiIsImEiOiJjbWM0emZqaDkwbTkzMmpvZnVmMXg0cDk0In0.-BKmIUbF7HoXSVCyDDUxRA',
    'firebase': 'AIzaSyBnxjrxNYMCfAljhcyG_c8gVmCHI7NAJ1k'
}

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', 'https://iranvsisrael.live')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Credentials', 'true')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()

    def send_json_response(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_GET(self):
        # API key endpoints
        if self.path == '/api/keys/gemini':
            self.send_json_response({'key': API_KEYS['gemini']})
            return
        elif self.path == '/api/keys/news':
            self.send_json_response({'key': API_KEYS['news']})
            return
        elif self.path == '/api/keys/mapbox':
            self.send_json_response({'key': API_KEYS['mapbox']})
            return
        elif self.path == '/api/keys/firebase':
            self.send_json_response({'key': API_KEYS['firebase']})
            return
        elif self.path == '/api/keys':
            self.send_json_response(API_KEYS)
            return
        # Serve index.html for the root path
        elif self.path == '/':
            self.path = '/src/index.html'
            return http.server.SimpleHTTPRequestHandler.do_GET(self)
        # Serve all files normally
        else:
            return http.server.SimpleHTTPRequestHandler.do_GET(self)

Handler = CORSHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever() 