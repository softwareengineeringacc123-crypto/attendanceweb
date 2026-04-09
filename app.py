from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from supabase import create_client, Client
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "webattendance")

# Supabase Configuration
supabaseUrl = os.getenv("SUPABASE_URL")
supabaseAnonKey = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabaseUrl, supabaseAnonKey)

@app.route("/")
def home():
    return redirect(url_for("login"))

@app.route("/index")
def index():
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    """Unified login for both teachers and students"""
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        
        if not email or not password:
            return render_template(
                "login.html",
                error="Please fill in all fields.",
                email=email,
            )

        try:
            # Authenticate user with Supabase
            response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if response.user:
                session["user"] = response.user.id
                session["email"] = response.user.email
                
                # Get role from auth.user metadata
                user_metadata = getattr(response.user, "user_metadata", {}) or {}
                user_type = user_metadata.get("role")
                
                if not user_type:
                    return render_template(
                        "login.html",
                        error="User role not found. Please re-register.",
                        email=response.user.email,
                    )
                
                session["user_type"] = user_type
                session["user_name"] = user_metadata.get("name")
                
                if user_type == "teacher":
                    return redirect(url_for("teacherdashboard"))
                elif user_type == "student":
                    return redirect(url_for("studentdashboard"))
                else:
                    return render_template(
                        "login.html",
                        error="Invalid user type.",
                        email=response.user.email,
                    )
            else:
                return render_template(
                    "login.html",
                    error="Invalid credentials.",
                    email=email,
                )
        except Exception as e:
            return render_template(
                "login.html",
                error=f"Login failed: {str(e)}",
                email=email,
            )
    
    return render_template("login.html")

@app.route("/teacherlogin", methods=["GET", "POST"])
def teacherlogin():
    """Backward compatibility - redirects to unified login"""
    return redirect(url_for("login"))

@app.route("/studentlogin", methods=["GET", "POST"])
def studentlogin():
    """Backward compatibility - redirects to unified login"""
    return redirect(url_for("login"))
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")
        confirm_password = request.form.get("confirm_password")
        fullname = request.form.get("fullname")
        user_type = request.form.get("user_type")

        if not email or not password or not confirm_password or not fullname or not user_type:
            return render_template(
                "register.html",
                error="Please fill in all fields.",
                email=email,
                fullname=fullname,
                user_type=user_type,
            )

        if password != confirm_password:
            return render_template(
                "register.html",
                error="Passwords do not match.",
                email=email,
                fullname=fullname,
                user_type=user_type,
            )

        try:
            # Sign up user with Supabase auth (trigger will create profile)
            response = supabase.auth.sign_up({
                "email": email,
                "password": password,
                "options": {
                    "data": {
                        "name": fullname,
                        "role": user_type
                    }
                }
            })

            if not response.user or not getattr(response.user, "id", None):
                return render_template(
                    "register.html",
                    error="Registration failed. Try again.",
                    email=email,
                    fullname=fullname,
                    user_type=user_type,
                )

            if user_type == "student":
                return redirect(url_for("studentlogin"))
            return redirect(url_for("teacherlogin"))
        except Exception as e:
            return render_template(
                "register.html",
                error=f"Error: {str(e)}",
                email=email,
                fullname=fullname,
                user_type=user_type,
            )

    return render_template("register.html")

@app.route("/studentdashboard")
def studentdashboard():
    if "user" not in session:
        return redirect(url_for("login"))
    
    try:
        # Retrieve current user profile data
        user_email = session.get("email")
        user_data = supabase.table("users").select("*").eq("email", user_email).execute()
        return render_template("studentdashboard.html", user=user_data.data[0] if user_data.data else None)
    except Exception as e:
        return render_template("studentdashboard.html", error=f"Error: {str(e)}")

@app.route("/teacherdashboard")
def teacherdashboard():
    if "user" not in session:
        return redirect(url_for("login"))
    
    try:
        # Retrieve current user profile data
        user_email = session.get("email")
        user_data = supabase.table("users").select("*").eq("email", user_email).execute()
        
        return render_template("teacherdashboard.html", user=user_data.data[0] if user_data.data else None)
    except Exception as e:
        return render_template("teacherdashboard.html", error=f"Error: {str(e)}")

@app.route("/logout")
def logout():
    try:
        supabase.auth.sign_out()
    except:
        pass
    session.clear()
    return redirect(url_for("login"))

# ===== DATA RETRIEVAL ENDPOINTS =====

@app.route("/api/get-users", methods=["GET"])
def get_users():
    """Retrieve all user profiles from database"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        users = supabase.table("profiles").select("*").execute()
        return jsonify(users.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-attendance", methods=["GET"])
def get_attendance():
    """Retrieve all attendance records"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        attendance = supabase.table("attendance").select("*").execute()
        return jsonify(attendance.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-attendance/<user_id>", methods=["GET"])
def get_user_attendance(user_id):
    """Retrieve attendance records for a specific user"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        attendance = supabase.table("attendance").select("*").eq("user_id", user_id).execute()
        return jsonify(attendance.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===== DATA INSERTION ENDPOINTS =====

@app.route("/api/mark-attendance", methods=["POST"])
def mark_attendance():
    """Mark attendance for a user"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        attendance_record = {
            "user_id": data.get("user_id"),
            "status": data.get("status", "present"),  # present, absent, late
            "timestamp": datetime.now().isoformat(),
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        result = supabase.table("attendance").insert(attendance_record).execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/add-class", methods=["POST"])
def add_class():
    """Add a new class"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        class_data = {
            "teacher_id": session.get("user"),
            "class_name": data.get("class_name"),
            "subject": data.get("subject"),
            "section": data.get("section"),
            "schedule": data.get("schedule"),
            "password": data.get("password"),
            "qr_data": data.get("qr_data"),
            "created_at": datetime.now().isoformat()
        }
        
        result = supabase.table("classes").insert(class_data).execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/get-classes", methods=["GET"])
def get_classes():
    """Retrieve classes for the current teacher"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        classes = supabase.table("classes").select("*").eq("teacher_id", session.get("user")).execute()
        return jsonify(classes.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/update-class/<class_id>", methods=["PUT"])
def update_class(class_id):
    """Update class metadata"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        result = supabase.table("classes").update(data).eq("id", class_id).execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===== DATA UPDATE ENDPOINTS =====

@app.route("/api/update-attendance/<attendance_id>", methods=["PUT"])
def update_attendance(attendance_id):
    """Update attendance record"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        data = request.get_json()
        result = supabase.table("attendance").update(data).eq("id", attendance_id).execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===== DATA DELETION ENDPOINTS =====

@app.route("/api/delete-attendance/<attendance_id>", methods=["DELETE"])
def delete_attendance(attendance_id):
    """Delete attendance record"""
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    try:
        result = supabase.table("attendance").delete().eq("id", attendance_id).execute()
        return jsonify({"message": "Deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)