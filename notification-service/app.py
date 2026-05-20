from flask import Flask, jsonify, request

app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify(status="ok", service="notification-service"), 200

@app.post("/notify")
def notify():
    data = request.get_json(silent=True) or {}
    return jsonify(
        status="queued",
        service="notification-service",
        received=data
    ), 200

@app.get("/")
def index():
    return jsonify(status="ok", message="notification-service running"), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)