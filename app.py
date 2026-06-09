import os
from functools import wraps

from dotenv import load_dotenv
load_dotenv()  # charge .env en dev, sans effet en prod Docker

from flask import Flask, jsonify, request, send_from_directory, Response, session

import database as db
import reports
import scheduler

app = Flask(__name__, static_folder='static', static_url_path='/static')

app.secret_key      = os.environ.get('SECRET_KEY', 'links-wireless-secret-changeme')
ADMIN_PASSWORD      = os.environ.get('ADMIN_PASSWORD', '')

# Init DB + scheduler dès l'import (gunicorn charge app:app, pas __main__)
db.init_db()
scheduler.start()


# ── AUTH ──────────────────────────────────────────────────────────────────────

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('is_admin'):
            return jsonify({'error': 'Non autorisé — connexion admin requise'}), 401
        return f(*args, **kwargs)
    return decorated


@app.route('/api/login', methods=['POST'])
def login():
    if not ADMIN_PASSWORD:
        return jsonify({'error': 'ADMIN_PASSWORD non configuré sur le serveur'}), 500
    data = request.get_json(silent=True) or {}
    if data.get('password') == ADMIN_PASSWORD:
        session['is_admin'] = True
        return jsonify({'ok': True})
    return jsonify({'error': 'Mot de passe incorrect'}), 401


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/me')
def me():
    return jsonify({'is_admin': bool(session.get('is_admin'))})


# ── FRONTEND ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js', mimetype='application/javascript')


# ── IMPORT PDF (admin) ────────────────────────────────────────────────────────

@app.route('/api/import', methods=['POST'])
@admin_required
def import_pdf():
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier envoyé'}), 400

    f = request.files['file']
    if not f.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Fichier PDF requis'}), 400

    data = f.read()
    try:
        coupons = db.parse_pdf_bytes(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 422

    if not coupons:
        return jsonify({'error': 'Aucun coupon trouvé dans ce PDF'}), 422

    result = db.insert_coupons(coupons)
    return jsonify({'parsed': len(coupons), **result}), 200


# ── COUPONS ───────────────────────────────────────────────────────────────────

@app.route('/api/coupons', methods=['GET'])
def list_coupons():
    forfait = request.args.get('forfait') or None
    vendu   = request.args.get('vendu') or None
    q       = request.args.get('q') or None
    rows = db.get_coupons(forfait=forfait, vendu=vendu, q=q)
    return jsonify(rows)


@app.route('/api/coupons/<coupon_id>', methods=['PATCH'])
def patch_coupon(coupon_id):
    body  = request.get_json(silent=True) or {}
    vendu = bool(body.get('vendu', False))
    row   = db.toggle_vendu(coupon_id, vendu)
    if row is None:
        return jsonify({'error': 'Coupon introuvable'}), 404
    return jsonify(row)


@app.route('/api/coupons', methods=['DELETE'])
@admin_required
def delete_all():
    db.clear_all()
    return jsonify({'ok': True})


# ── STATS (public) ────────────────────────────────────────────────────────────

@app.route('/api/stats')
def stats():
    return jsonify(db.get_stats())


@app.route('/api/forfaits')
def forfaits():
    return jsonify(db.get_forfaits())


# ── EXPORT (admin) ────────────────────────────────────────────────────────────

@app.route('/api/export')
@admin_required
def export():
    forfait = request.args.get('forfait') or None
    rows = db.get_coupons(forfait=forfait, vendu='0')

    lines = ['Forfait\tUsername\tPassword\tTemps\tValidite\tPrix (FCFA)']
    for c in rows:
        lines.append(
            f"{c['forfait']}\t{c['username']}\t{c['password']}\t"
            f"{c['temps']}\t{c['validite']}\t{c['prix']}"
        )
    content = '\n'.join(lines)

    return Response(
        '﻿' + content,
        mimetype='text/plain; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename=coupons_restants.txt'},
    )


# ── RAPPORTS (admin) ──────────────────────────────────────────────────────────

@app.route('/api/report/test/<period>', methods=['POST'])
@admin_required
def report_test(period):
    if period not in ('daily', 'weekly', 'monthly'):
        return jsonify({'error': 'Période invalide'}), 400
    try:
        reports.send_report(period)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'ok': True, 'sent_to': reports.MAIL_TO})


# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5076))
    app.run(host='0.0.0.0', port=port, debug=False)
