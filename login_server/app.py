from flask import Flask, request, render_template, render_template_string, flash,redirect
import mysql.connector
from werkzeug.security import check_password_hash

app = Flask(__name__)
app.secret_key = "supersecretkey"

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "Redminote10s",
    "database": "file_transfer"
}

@app.route('/login', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':

        email = request.form['email']
        password = request.form['password']

        conn = mysql.connector.connect(**DB_CONFIG)

        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT * FROM users WHERE email=%s",
            (email,)
        )

        user = cursor.fetchone()

        cursor.close()
        conn.close()

        if not user:
            flash("User not found", "error")
            return render_template("login.html")

        if not check_password_hash(user['password'], password):
            flash("Incorrect password", "error")
            return render_template("login.html")

        return render_template_string("""
        <html>
        <body onload="document.forms[0].submit()">

            <form action="http://localhost:5000/home"
                  method="POST">

                <input type="hidden"
                       name="loggedUser"
                       value="{{ user_id }}">

            </form>

        </body>
        </html>
        """, user_id=user['id'])

    return render_template("login.html")

# ================= REGISTER =================
@app.route('/register', methods=['GET', 'POST'])
def register():

    if request.method == 'POST':

        username = request.form['username']
        email = request.form['email']

        from werkzeug.security import generate_password_hash

        password = generate_password_hash(
            request.form['password']
        )

        conn = mysql.connector.connect(**DB_CONFIG)

        cursor = conn.cursor(dictionary=True)

        # CHECK EMAIL
        cursor.execute(
            "SELECT * FROM users WHERE email=%s",
            (email,)
        )

        if cursor.fetchone():

            flash("Email already exists", "error")

            cursor.close()
            conn.close()

            return render_template("register.html")

        # INSERT USER
        cursor.execute("""
            INSERT INTO users
            (username, email, password)
            VALUES (%s, %s, %s)
        """, (
            username,
            email,
            password
        ))

        conn.commit()

        cursor.close()
        conn.close()

        flash("Registration successful", "success")

        return redirect('/login')

    return render_template("register.html")
if __name__ == "__main__":
    app.run(port=8000, debug=True)