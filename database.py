import io
import os
import re
import sqlite3
from datetime import datetime

DB_PATH = os.environ.get('DATABASE_PATH', 'data/coupons.db')

PATTERN = re.compile(
    r'LINKS\s+WIRELESS\s+FORFAIT\s+(\S+)\s+Temps\s+Validit[e\xe9]\s+Prix\s+'
    r'(\S+)\s+(\S+)\s+([\d.,]+)\s+Fcfa\s+Username\s+Password\s+(\S+)\s+(\S+)',
    re.IGNORECASE,
)


def get_db():
    os.makedirs(os.path.dirname(DB_PATH) or '.', exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS coupons (
                id         TEXT PRIMARY KEY,
                forfait    TEXT NOT NULL,
                temps      TEXT,
                validite   TEXT,
                prix       REAL,
                username   TEXT,
                password   TEXT,
                vendu      INTEGER DEFAULT 0,
                date_vente TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


# ── PDF PARSING ──────────────────────────────────────────────────────────────

def parse_pdf_bytes(data: bytes) -> list[dict]:
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        text = ' '.join(page.extract_text() or '' for page in reader.pages)
    except Exception as e:
        raise ValueError(f'Erreur lecture PDF : {e}')

    text = re.sub(r'\s+', ' ', text)
    results = []
    for m in PATTERN.finditer(text):
        user = m.group(5)
        if user.lower() in ('username', 'password'):
            continue
        results.append({
            'id':       user,
            'forfait':  m.group(1),
            'temps':    m.group(2),
            'validite': m.group(3),
            'prix':     float(m.group(4).replace(',', '.')),
            'username': user,
            'password': m.group(6),
        })
    return results


# ── CRUD ─────────────────────────────────────────────────────────────────────

def insert_coupons(coupons: list[dict]) -> dict:
    """Insert coupons, skip duplicates. Returns {added, skipped}."""
    added = skipped = 0
    with get_db() as conn:
        for c in coupons:
            try:
                conn.execute(
                    """INSERT INTO coupons
                       (id, forfait, temps, validite, prix, username, password)
                       VALUES (:id,:forfait,:temps,:validite,:prix,:username,:password)""",
                    c,
                )
                added += 1
            except sqlite3.IntegrityError:
                skipped += 1
        conn.commit()
    return {'added': added, 'skipped': skipped}


def get_coupons(forfait: str = None, vendu: str = None, q: str = None) -> list[dict]:
    sql = 'SELECT * FROM coupons WHERE 1=1'
    params: list = []
    if forfait:
        sql += ' AND forfait = ?'
        params.append(forfait)
    if vendu is not None:
        sql += ' AND vendu = ?'
        params.append(int(vendu))
    if q:
        sql += ' AND (username LIKE ? OR forfait LIKE ?)'
        like = f'%{q}%'
        params += [like, like]
    sql += ' ORDER BY forfait, created_at'
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def toggle_vendu(coupon_id: str, vendu: bool) -> dict | None:
    date_vente = datetime.now().strftime('%d/%m/%Y') if vendu else None
    with get_db() as conn:
        conn.execute(
            'UPDATE coupons SET vendu=?, date_vente=? WHERE id=?',
            (int(vendu), date_vente, coupon_id),
        )
        conn.commit()
        row = conn.execute('SELECT * FROM coupons WHERE id=?', (coupon_id,)).fetchone()
    return dict(row) if row else None


def get_stats() -> dict:
    with get_db() as conn:
        total   = conn.execute('SELECT COUNT(*) FROM coupons').fetchone()[0]
        vendus  = conn.execute('SELECT COUNT(*) FROM coupons WHERE vendu=1').fetchone()[0]
        montant = conn.execute(
            'SELECT COALESCE(SUM(prix),0) FROM coupons WHERE vendu=0'
        ).fetchone()[0]

        by_profile = []
        rows = conn.execute("""
            SELECT forfait,
                   COUNT(*) as total,
                   SUM(vendu) as vendus,
                   SUM(CASE WHEN vendu=0 THEN prix ELSE 0 END) as montant_restant
            FROM coupons GROUP BY forfait ORDER BY forfait
        """).fetchall()
        for r in rows:
            by_profile.append(dict(r))

    return {
        'total':    total,
        'vendus':   vendus,
        'restants': total - vendus,
        'montant_restant': montant,
        'by_profile': by_profile,
    }


def clear_all():
    with get_db() as conn:
        conn.execute('DELETE FROM coupons')
        conn.commit()


def get_forfaits() -> list[str]:
    with get_db() as conn:
        rows = conn.execute('SELECT DISTINCT forfait FROM coupons ORDER BY forfait').fetchall()
    return [r[0] for r in rows]
