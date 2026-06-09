"""Planification des rapports de vente via APScheduler.

Avec gunicorn (plusieurs workers), seul UN process doit lancer le scheduler,
sinon les emails partent en double. On utilise un verrou par socket : le premier
process qui réussit à binder le port garde le scheduler, les autres l'ignorent.
"""
import os
import socket

from apscheduler.schedulers.background import BackgroundScheduler

import reports

TIMEZONE  = os.environ.get('TZ', 'Africa/Lome')  # Togo = UTC+0
LOCK_PORT = int(os.environ.get('SCHED_LOCK_PORT', 47654))

_lock_sock = None  # garde la référence pour ne pas fermer le socket


def _acquire_lock() -> bool:
    global _lock_sock
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        s.bind(('127.0.0.1', LOCK_PORT))
    except OSError:
        s.close()
        return False
    _lock_sock = s
    return True


def start():
    """Démarre le scheduler si ce process détient le verrou et que SMTP est prêt."""
    if not (reports.SMTP_USER and reports.SMTP_PASS and reports.MAIL_TO):
        print("[scheduler] SMTP non configuré — rapports désactivés.")
        return
    if not _acquire_lock():
        return  # un autre worker s'en charge déjà

    sched = BackgroundScheduler(timezone=TIMEZONE)
    # Journalier : chaque jour à 08h00 (ventes de la veille)
    sched.add_job(lambda: reports.send_report('daily'),
                  'cron', hour=8, minute=0, id='daily')
    # Hebdomadaire : chaque lundi à 08h00 (semaine précédente)
    sched.add_job(lambda: reports.send_report('weekly'),
                  'cron', day_of_week='mon', hour=8, minute=0, id='weekly')
    # Mensuel : le 11 de chaque mois à 08h00 (mois précédent)
    sched.add_job(lambda: reports.send_report('monthly'),
                  'cron', day=11, hour=8, minute=0, id='monthly')
    sched.start()
    print(f"[scheduler] Démarré (tz={TIMEZONE}) — daily 8h, weekly lundi 8h, monthly le 11 à 8h.")
