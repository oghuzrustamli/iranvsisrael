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
        # Allow both localhost and production domain
        origin = self.headers.get('Origin', '')
        allowed_origins = ['https://iranvsisrael.live', 'http://localhost:8000', 'http://127.0.0.1:8000']
        
        if origin in allowed_origins:
            self.send_header('Access-Control-Allow-Origin', origin)
        else:
            self.send_header('Access-Control-Allow-Origin', 'https://iranvsisrael.live')
            
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Origin, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
        except Exception as e:
            print(f"Error in OPTIONS request: {e}")
            self.send_error(500, "Internal Server Error")

    def send_json_response(self, data):
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())
        except Exception as e:
            print(f"Error sending JSON response: {e}")
            self.send_error(500, "Internal Server Error")

    def do_GET(self):
        try:
            # API key endpoints
            if self.path.startswith('/api/keys'):
                if self.path == '/api/keys/gemini':
                    self.send_json_response({'key': API_KEYS['gemini']})
                elif self.path == '/api/keys/news':
                    self.send_json_response({'key': API_KEYS['news']})
                elif self.path == '/api/keys/mapbox':
                    self.send_json_response({'key': API_KEYS['mapbox']})
                elif self.path == '/api/keys/firebase':
                    self.send_json_response({'key': API_KEYS['firebase']})
                elif self.path == '/api/keys':
                    self.send_json_response(API_KEYS)
                return
            
            # Serve index.html for the root path
            if self.path == '/':
                self.path = '/src/index.html'
            
            # Serve all files normally
            return http.server.SimpleHTTPRequestHandler.do_GET(self)
            
        except Exception as e:
            print(f"Error in GET request: {e}")
            self.send_error(500, "Internal Server Error")

Handler = CORSHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close() 