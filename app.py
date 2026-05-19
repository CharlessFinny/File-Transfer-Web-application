from flask import Flask, render_template, request, redirect, session, flash, send_file, jsonify
import mysql.connector
import os
import uuid
import mimetypes
import re
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from config import SECRET_KEY, UPLOAD_FOLDER, DB_CONFIG

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ================= CONSTANTS & HELPERS =================
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'


def format_time(rows):
    for r in rows:
        if r.get('upload_time') and hasattr(r['upload_time'], 'strftime'):
            r['upload_time'] = r['upload_time'].strftime('%d %b %Y, %I:%M %p')
    return rows

# ================= DB =================
def get_db():
    conn = mysql.connector.connect(**DB_CONFIG)
    return conn, conn.cursor(dictionary=True)

# ================= FILE VALIDATION =================
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'zip'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_safe_file(filepath):
    mime, _ = mimetypes.guess_type(filepath)
    return mime and mime.startswith(('image', 'text', 'application/pdf', 'application/zip'))

# ================= REGISTER =================
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        email = request.form['email']
        password = generate_password_hash(request.form['password'])

        conn, cursor = get_db()
        cursor.execute("SELECT * FROM users WHERE email=%s", (email,))
        if cursor.fetchone():
            flash("Email already exists")
            cursor.close()
            conn.close()
            return render_template('register.html')

        cursor.execute(
            "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
            (username, email, password)
        )
        conn.commit()
        cursor.close()
        conn.close()

        flash("Registration successful. Please login.")
        return redirect('/login')

    return render_template('register.html')

# ================= LOGIN =================
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']

        conn, cursor = get_db()
        cursor.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if not user:
            flash("User not found", "error")
            return render_template('login.html')

        if not check_password_hash(user['password'], password):
            flash("Incorrect password", "error")
            return render_template('login.html')

        session['user_id'] = user['id']
        return redirect('/home')

    return render_template('login.html')

# ================= HOME =================
@app.route('/home')
def home():
    if 'user_id' not in session:
        return redirect('/login')

    conn, cursor = get_db()

    try:
        # ================= USER =================
        cursor.execute(
            "SELECT username, email FROM users WHERE id=%s",
            (session['user_id'],)
        )
        user = cursor.fetchone()

        if not user:
            session.clear()
            return redirect('/login')

        # ================= CONTACT LISTS =================
        cursor.execute("""
            SELECT 
                cl.id,
                cl.list_name,
                COUNT(m.id) AS member_count
            FROM contact_lists cl
            LEFT JOIN contact_list_members m 
            ON cl.id = m.list_id
            WHERE cl.user_id = %s
            GROUP BY cl.id
            ORDER BY cl.created_at DESC
        """, (session['user_id'],))

        lists = cursor.fetchall()

        # 🔥 attach members
        for l in lists:
            cursor.execute("""
                SELECT name, email
                FROM contact_list_members
                WHERE list_id = %s
            """, (l['id'],))

            members = cursor.fetchall()

            l['members'] = [
                {"name": m['name'], "email": m['email']}
                for m in members
            ]

        # ================= ALL USERS =================
        cursor.execute(
            "SELECT id, username, email FROM users WHERE id != %s",
            (session['user_id'],)
        )
        all_users = cursor.fetchall()

        # ================= SENT =================
        cursor.execute("""
            SELECT f.*, u.username AS receiver_name, u.email AS receiver_email
            FROM files f
            JOIN users u ON f.receiver_id = u.id
            WHERE f.sender_id=%s AND f.is_deleted=FALSE
            ORDER BY f.upload_time DESC, f.id DESC
        """, (session['user_id'],))
        sent = format_time(cursor.fetchall())

        # ================= RECEIVED =================
        cursor.execute("""
            SELECT f.*, u.username AS sender_name, u.email AS sender_email
            FROM files f
            JOIN users u ON f.sender_id = u.id
            WHERE f.receiver_id=%s AND f.is_deleted=FALSE
            ORDER BY f.upload_time DESC, f.id DESC
        """, (session['user_id'],))
        received = format_time(cursor.fetchall())

        # ================= TRASH =================
       # ================= TRASH =================
        cursor.execute("""
            SELECT f.*, 
                s.username AS sender_name,
                r.username AS receiver_name
            FROM files f
            JOIN users s ON f.sender_id = s.id
            JOIN users r ON f.receiver_id = r.id
            WHERE (f.sender_id=%s OR f.receiver_id=%s)
            AND f.is_deleted=TRUE
            ORDER BY f.deleted_at DESC, f.id DESC
        """, (
            session['user_id'],
            session['user_id']
        ))

        trash = cursor.fetchall()

        for t in trash:
            if t.get('deleted_at'):
                t['deleted_at'] = t['deleted_at'].strftime('%d %b %Y, %I:%M %p')

    except Exception as e:
        print("ERROR:", e)
        return "Something went wrong", 500

    finally:
        cursor.close()
        conn.close()

    return render_template(
        'home.html',
        sent=sent,
        received=received,
        trash=trash,
        user=user,
        lists=lists,
        all_users=all_users
    )
def get_unique_filename(cursor, filename, sender_id):
    return filename
    base, ext = os.path.splitext(filename)

    cursor.execute("""
        SELECT filename FROM files 
        WHERE sender_id = %s AND filename LIKE %s
    """, (sender_id, base + "%"))

    existing = [row['filename'] for row in cursor.fetchall()]

    if filename not in existing:
        return filename

    i = 1
    while True:
        new_name = f"{base}({i}){ext}"
        if new_name not in existing:
            return new_name
        i += 1
@app.route('/upload', methods=['POST'])
def upload():
    if 'user_id' not in session:
        return redirect('/login')

    conn, cursor = get_db()

    list_id = request.form.get('list_id')
    receivers_input = request.form.get('receivers', '')
    description = request.form.get('description', '')
    files = request.files.getlist('files')

    if not files or files[0].filename == '':
        flash("No files selected")
        return redirect('/home')

    # ===== REMOVE DUPLICATES =====
    seen = set()
    clean_files = []

    for file in files:
        filename = file.filename.strip().lower()

        if not filename:
            continue

        if filename in seen:
            flash(f"Duplicate file detected: {filename}")
            return redirect('/home')

        seen.add(filename)
        clean_files.append(file)

    # ===== GET RECEIVERS =====
# ===== GET RECEIVERS =====
    if list_id:

        cursor.execute(
            "SELECT email FROM contact_list_members WHERE list_id=%s",
            (list_id,)
        )

        receiver_emails = [
            r['email'].strip().lower()
            for r in cursor.fetchall()
        ]

        if not receiver_emails:
            flash("Selected group is empty")
            return redirect('/home')

    elif receivers_input:

        # support commas + spaces + newlines
        raw_emails = re.split(r'[,\n]+', receivers_input)

        receiver_emails = []

        for email in raw_emails:

            clean_email = email.strip().lower()

            if clean_email:
                receiver_emails.append(clean_email)

    else:
        flash("No recipients provided")
        return redirect('/home')

    # ===== VALIDATE USERS =====
    valid_receivers = []

    for email in receiver_emails:

        cursor.execute(
            "SELECT id FROM users WHERE LOWER(email)=%s",
            (email,)
        )

        user = cursor.fetchone()

        if user:
            valid_receivers.append(user['id'])

    if not valid_receivers:
        flash("No valid users found")
        return redirect('/home')

    # ===== GROUP FLAG =====
    is_group = bool(list_id)

    # ===== GET SENDER USERNAME =====
    cursor.execute("SELECT username FROM users WHERE id=%s", (session['user_id'],))
    sender_user = cursor.fetchone()
    sender_name = sender_user['username']

    # ===== FOLDER STRUCTURE =====
    base_sent = os.path.join(app.config['UPLOAD_FOLDER'], "sent")
    

    sender_folder = os.path.join(base_sent, sender_name)

    os.makedirs(sender_folder, exist_ok=True)
    

    

    uploaded_count = 0

    # ===== FILE PROCESS =====
# ===== FILE PROCESS =====
    for file in clean_files:

        if not allowed_file(file.filename):
            continue

        original_name = secure_filename(file.filename)

        filename = f"{uuid.uuid4()}_{original_name}"

        ext = os.path.splitext(filename)[1]

        uuid_name = f"{uuid.uuid4()}{ext}"

        sender_path = os.path.join(sender_folder, uuid_name)

        file.stream.seek(0)
        file.save(sender_path)

        if not is_safe_file(sender_path):
            os.remove(sender_path)
            continue

        file_size = os.path.getsize(sender_path)

        file_type = filename.rsplit('.', 1)[1].lower()

        # SEND TO RECEIVERS
        for receiver_id in valid_receivers:

            cursor.execute("""
                INSERT INTO files
                (filename, filepath, file_type, file_size,
                sender_id, receiver_id, description,
                status, is_deleted, groupFlag)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, FALSE, %s)
            """, (
                filename,
                sender_path,
                file_type,
                file_size,
                session['user_id'],
                receiver_id,
                description,
                "Not Seen",
                is_group
            ))

            uploaded_count += 1

    conn.commit()
    cursor.close()
    conn.close()

    flash(f"{uploaded_count} files sent successfully")
    return redirect('/home')

@app.route('/preview/<int:file_id>')
def preview(file_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("SELECT * FROM files WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (file_id, session['user_id'], session['user_id']))
    file = cursor.fetchone()
    if not file:
        return "File not found"
    if file['receiver_id'] == session['user_id']:
        cursor.execute("UPDATE files SET status='Seen', seen_at=NOW() WHERE id=%s", (file_id,))
        conn.commit()
    cursor.close()
    conn.close()
    return send_file(file['filepath'])

@app.route('/download/<int:file_id>')
def download(file_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("SELECT * FROM files WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (file_id, session['user_id'], session['user_id']))
    file = cursor.fetchone()
    if not file:
        cursor.close()
        conn.close()
        return "Unauthorized", 403
    if file['receiver_id'] == session['user_id']:
        cursor.execute("UPDATE files SET status='Seen', seen_at=NOW() WHERE id=%s", (file_id,))
        conn.commit()
    cursor.close()
    conn.close()
    return send_file(file['filepath'], as_attachment=True)

# ================= CONTACT LIST MANAGEMENT =================
@app.route('/create_list', methods=['POST'])
def create_list():
    if 'user_id' not in session: return redirect('/login')
    data = request.get_json()
    list_name = data.get('list_name')
    members = data.get('members', [])
    if not list_name or not members: return jsonify({"success": False, "error": "Invalid data"})

    emails = set()
    for m in members:
        if not m.get('email') or not m.get('name'): return jsonify({"success": False, "error": "Empty fields"})
        if m['email'] in emails: return jsonify({"success": False, "error": "Duplicate email"})
        emails.add(m['email'])
        if not re.match(EMAIL_REGEX, m['email']): return jsonify({"success": False, "error": f"Invalid email: {m['email']}"})

    conn, cursor = get_db()
    cursor.execute("INSERT INTO contact_lists (user_id, list_name) VALUES (%s, %s)", (session['user_id'], list_name))
    list_id = cursor.lastrowid
    for m in members:
        cursor.execute("INSERT INTO contact_list_members (list_id, name, email) VALUES (%s, %s, %s)", (list_id, m['name'], m['email']))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"success": True})

@app.route('/delete_list/<int:list_id>', methods=['POST'])
def delete_list(list_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("SELECT id FROM contact_lists WHERE id=%s AND user_id=%s", (list_id, session['user_id']))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        return "Unauthorized", 403
    cursor.execute("DELETE FROM contact_list_members WHERE list_id=%s", (list_id,))
    cursor.execute("DELETE FROM contact_lists WHERE id=%s", (list_id,))
    conn.commit()
    cursor.close()
    conn.close()
    flash("List deleted successfully")
    return redirect('/home')

@app.route('/update_list/<int:list_id>', methods=['POST'])
def update_list(list_id):
    if 'user_id' not in session: return jsonify({"success": False, "error": "Unauthorized"})
    data = request.get_json()
    list_name = data.get('list_name')
    members = data.get('members', [])
    emails = set()
    for m in members:
        if m['email'] in emails: return jsonify({"success": False, "error": "Duplicate emails"})
        emails.add(m['email'])

    conn, cursor = get_db()
    cursor.execute("SELECT id FROM contact_lists WHERE id=%s AND user_id=%s", (list_id, session['user_id']))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({"success": False, "error": "Unauthorized"})
    cursor.execute("UPDATE contact_lists SET list_name=%s WHERE id=%s", (list_name, list_id))
    cursor.execute("DELETE FROM contact_list_members WHERE list_id=%s", (list_id,))
    for m in members:
        cursor.execute("INSERT INTO contact_list_members (list_id, name, email) VALUES (%s, %s, %s)", (list_id, m['name'], m['email']))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"success": True})

@app.route('/get_list/<int:list_id>')
def get_list(list_id):
    if 'user_id' not in session: return jsonify({"error": "Unauthorized"}), 403
    conn, cursor = get_db()
    cursor.execute("SELECT id FROM contact_lists WHERE id=%s AND user_id=%s", (list_id, session['user_id']))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({"error": "Unauthorized"}), 403
# get list name
    cursor.execute("SELECT list_name FROM contact_lists WHERE id=%s", (list_id,))
    list_data = cursor.fetchone()

    cursor.execute("SELECT name, email FROM contact_list_members WHERE list_id=%s", (list_id,))
    members = cursor.fetchall()

    return jsonify({
        "list_name": list_data['list_name'],
        "members": members
    })

# ================= PROFILE & LOGOUT =================
@app.route('/update_profile', methods=['POST'])
def update_profile():
    if 'user_id' not in session: return jsonify({"success": False, "error": "Unauthorized"})
    data = request.get_json()
    username, email = data.get('username'), data.get('email')
    conn, cursor = get_db()
    cursor.execute("SELECT id FROM users WHERE email=%s AND id!=%s", (email, session['user_id']))
    if cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({"success": False, "error": "Email already in use"})
    cursor.execute("UPDATE users SET username=%s, email=%s WHERE id=%s", (username, email, session['user_id']))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"success": True})

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')

# ================= DELETE / RESTORE ACTIONS =================
@app.route('/delete/<int:file_id>')
def delete_file(file_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("UPDATE files SET is_deleted=TRUE,deleted_at=NOW() WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (file_id, session['user_id'], session['user_id']))
    conn.commit()
    cursor.close()
    conn.close()
    flash("Moved to Trash")
    return redirect('/home')

@app.route('/restore/<int:file_id>')
def restore_file(file_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("UPDATE files SET is_deleted=FALSE WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (file_id, session['user_id'], session['user_id']))
    conn.commit()
    cursor.close()
    conn.close()
    flash("File restored")
    return redirect('/home')

@app.route('/permanent_delete/<int:file_id>')
def permanent_delete(file_id):
    if 'user_id' not in session: return redirect('/login')
    conn, cursor = get_db()
    cursor.execute("SELECT filepath FROM files WHERE id=%s", (file_id,))
    file = cursor.fetchone()
    if file:
        try:
            if os.path.exists(file['filepath']): os.remove(file['filepath'])
        except: pass
        cursor.execute("DELETE FROM files WHERE id=%s", (file_id,))
        conn.commit()
    cursor.close()
    conn.close()
    flash("File permanently deleted")
    return redirect('/home')

# ================= BULK ACTIONS =================
@app.route('/bulk_delete', methods=['POST'])
def bulk_delete():
    if 'user_id' not in session: return '', 403
    data = request.get_json()
    files = data.get('files', [])
    conn, cursor = get_db()
    for fid in files:
        cursor.execute("UPDATE files SET is_deleted=TRUE,deleted_at=NOW() WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (fid, session['user_id'], session['user_id']))
    conn.commit()
    cursor.close()
    conn.close()
    flash("Selected files moved to Trash")
    return '', 200

@app.route('/bulk_restore', methods=['POST'])
def bulk_restore():
    if 'user_id' not in session: return '', 403
    data = request.get_json()
    files = data.get('files', [])
    conn, cursor = get_db()
    for fid in files:
        cursor.execute("UPDATE files SET is_deleted=FALSE,deleted_at=NULL WHERE id=%s AND (sender_id=%s OR receiver_id=%s)", (fid, session['user_id'], session['user_id']))
    conn.commit()
    cursor.close()
    conn.close()
    flash("Selected files restored")
    return '', 200


@app.route('/bulk_permanent_delete', methods=['POST'])
def bulk_permanent_delete():
    if 'user_id' not in session: return '', 403
    data = request.get_json()
    files = data.get('files', [])
    conn, cursor = get_db()
    for fid in files:
        cursor.execute("SELECT filepath FROM files WHERE id=%s", (fid,))
        file = cursor.fetchone()
        if file:
            try:
                if os.path.exists(file['filepath']): os.remove(file['filepath'])
            except: pass
            cursor.execute("DELETE FROM files WHERE id=%s", (fid,))
    conn.commit()
    cursor.close()
    conn.close()
    flash("Selected files permanently deleted")
    return '', 200


if __name__ == "__main__":
    app.run(debug=True)