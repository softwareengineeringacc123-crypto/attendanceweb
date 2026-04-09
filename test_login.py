from flask import Flask, render_template, request, jsonify
from supabase import create_client, Client
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Supabase Configuration
supabaseUrl = os.getenv("SUPABASE_URL")
supabaseAnonKey = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabaseUrl, supabaseAnonKey)

@app.route("/test-login", methods=["GET", "POST"])
def test_login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        
        if not email or not password:
            return jsonify({"error": "Please fill in all fields."}), 400

        try:
            # Authenticate user with Supabase
            response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if response.user:
                # Get role from auth.user metadata
                user_metadata = getattr(response.user, "user_metadata", {}) or {}
                user_type = user_metadata.get("role")
                
                return jsonify({
                    "status": "success",
                    "user_id": response.user.id,
                    "email": response.user.email,
                    "user_type": user_type,
                    "user_name": user_metadata.get("name"),
                    "metadata": user_metadata
                }), 200
            else:
                return jsonify({"error": "Invalid credentials."}), 401
        except Exception as e:
            return jsonify({"error": f"Login failed: {str(e)}"}), 500
    
    return '''
    <html>
    <body>
        <h2>Test Login</h2>
        <form method="POST">
            <input type="email" name="email" placeholder="Email" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>
    </body>
    </html>
    '''

if __name__ == "__main__":
    app.run(debug=True, port=5001)
