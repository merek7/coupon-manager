"""Génération et envoi par email des rapports de vente (journalier, hebdo, mensuel)."""
import os
import smtplib
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import database as db

SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
SMTP_USER = os.environ.get('SMTP_USER', '')       # adresse Gmail expéditrice
SMTP_PASS = os.environ.get('SMTP_PASS', '')       # mot de passe d'application Gmail
MAIL_TO   = os.environ.get('MAIL_TO', '')         # destinataire du rapport
MAIL_FROM = os.environ.get('MAIL_FROM', SMTP_USER)

ACCENT = '#059669'
MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
        'août', 'septembre', 'octobre', 'novembre', 'décembre']


def _fcfa(n):
    return f"{int(round(n)):,}".replace(',', ' ') + " FCFA"


def _period_range(period: str, now: datetime):
    """Retourne (start, end, libellé) pour la période demandée."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == 'daily':
        start = today - timedelta(days=1)
        end   = today
        label = f"Journalier — {start.strftime('%d/%m/%Y')}"
    elif period == 'weekly':
        this_monday = today - timedelta(days=today.weekday())
        start = this_monday - timedelta(days=7)
        end   = this_monday
        label = (f"Hebdomadaire — du {start.strftime('%d/%m/%Y')} "
                 f"au {(end - timedelta(days=1)).strftime('%d/%m/%Y')}")
    elif period == 'monthly':
        first_this = today.replace(day=1)
        last_month_end = first_this
        prev = first_this - timedelta(days=1)
        start = prev.replace(day=1)
        end   = first_this
        label = f"Mensuel — {MOIS[start.month - 1]} {start.year}"
    else:
        raise ValueError(f"Période inconnue : {period}")
    return start, end, label


def build_report(period: str, now: datetime = None):
    """Construit (sujet, html) pour la période."""
    now = now or datetime.now()
    start, end, label = _period_range(period, now)
    sales = db.get_sales_report(start.isoformat(timespec='seconds'),
                                end.isoformat(timespec='seconds'))
    stock = db.get_stats()

    rows = ''
    for p in sales['by_profile']:
        rows += (
            f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e2e8f0'>{p['forfait']}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center'>{p['nb']}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right'>{_fcfa(p['montant'])}</td></tr>"
        )
    if not rows:
        rows = ("<tr><td colspan='3' style='padding:14px;text-align:center;color:#94a3b8'>"
                "Aucune vente sur cette période.</td></tr>")

    subject = f"[LINKS WIRELESS] Rapport {label}"
    html = f"""\
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <div style="background:linear-gradient(135deg,{ACCENT},#0d9488);padding:20px 24px;border-radius:12px 12px 0 0">
    <h2 style="margin:0;color:#fff;font-size:18px">LINKS WIRELESS</h2>
    <div style="color:#d1fae5;font-size:13px;margin-top:2px">Rapport de vente {label}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
    <div style="display:flex;gap:12px;margin-bottom:18px">
      <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:12px;color:#64748b">Coupons vendus</div>
        <div style="font-size:24px;font-weight:700;color:{ACCENT}">{sales['nb']}</div>
      </div>
      <div style="flex:1;background:#fff7ed;border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:12px;color:#64748b">Montant encaissé</div>
        <div style="font-size:24px;font-weight:700;color:#ea580c">{_fcfa(sales['montant'])}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#f8fafc">
        <th style="padding:8px 12px;text-align:left;color:#475569">Forfait</th>
        <th style="padding:8px 12px;text-align:center;color:#475569">Vendus</th>
        <th style="padding:8px 12px;text-align:right;color:#475569">Montant</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b">
      <strong>Stock actuel :</strong> {stock['restants']} coupons restants ·
      {_fcfa(stock['montant_restant'])} de valeur en stock.
    </div>
  </div>
</div>"""
    return subject, html


def send_email(subject: str, html: str) -> None:
    if not (SMTP_USER and SMTP_PASS and MAIL_TO):
        raise RuntimeError("SMTP non configuré (SMTP_USER / SMTP_PASS / MAIL_TO manquants)")
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = MAIL_FROM
    msg['To']      = MAIL_TO
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(MAIL_FROM, [MAIL_TO], msg.as_string())


def send_report(period: str) -> None:
    subject, html = build_report(period)
    send_email(subject, html)
    print(f"[reports] Rapport '{period}' envoyé à {MAIL_TO}")
