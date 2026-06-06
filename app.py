import io
import os

from flask import Flask, jsonify, request, send_from_directory, Response

import database as db

app = Flask(__name__, static_folder='static', static_url_path='/static')

# ── FRONTEND ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


# ── IMPORT PDF ────────────────────────────────────────────────────────────────

@app.route('/api/import', methods=['POST'])
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
    vendu   = request.args.get('vendu')          # "0" | "1" | None
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
def delete_all():
    db.clear_all()
    return jsonify({'ok': True})


# ── STATS ─────────────────────────────────────────────────────────────────────

@app.route('/api/stats')
def stats():
    return jsonify(db.get_stats())


@app.route('/api/forfaits')
def forfaits():
    return jsonify(db.get_forfaits())


# ── EXPORT ────────────────────────────────────────────────────────────────────

@app.route('/api/export')
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


# ── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    db.init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
